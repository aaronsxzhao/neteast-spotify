import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudStore } from '../src/cloud-state.js'
import { SyncService } from '../src/sync.js'
import { runCloudSync, cloudRunSummary } from '../src/cloud-policy.js'

const config = { spotifyClientId: 'client', spotifyRefreshToken: 'test-token', neteaseCookie: 'MUSIC_U=test', playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
function fixture() {
  const remote = { text: null, async load() { return this.text }, async save(text) { this.text = text } }
  const store = new CloudStore(config, 'a1'.repeat(32), remote)
  const calls = []
  const source = { name: 'A Specific Test Track', ar: [{ name: 'Test Artist' }], dt: 200000 }
  const spotify = {
    async searchTracks() { calls.push('search'); return [{ id: 'test', uri: 'spotify:track:test', name: source.name, artists: source.ar, duration_ms: source.dt }] },
    async replacePlaylist() { calls.push('replace') },
    async updatePlaylist() { calls.push('details') },
  }
  const sync = new SyncService(store, spotify, async () => { calls.push('netease'); return [source] })
  return { store, remote, calls, spotify, sync }
}

test('morning, hourly and forced runs make no provider calls during saved cooldown', async () => {
  const f = fixture()
  const now = new Date('2026-09-09T06:00:00Z')
  f.store.state.spotify.retryAfterUntil = Date.parse('2026-09-09T09:28:55Z')
  for (const options of [{}, { recoveryOnly: true }, { force: true }]) {
    const run = await runCloudSync(f.sync, options, now)
    assert.equal(run.reason, 'provider-cooldown')
    assert.match(cloudRunSummary(run), /2026-09-09T09:28:55.000Z/)
  }
  assert.deepEqual(f.calls, [])
})

test('hourly check with no pending cooldown does not sync early, even on a new day', async () => {
  const f = fixture()
  const run = await runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-09T23:59:59Z'))
  assert.equal(run.reason, 'before-daily-window')
  assert.match(cloudRunSummary(run), /Before 08:00/)
  assert.deepEqual(f.calls, [])
})

test('expired cooldown recovers once and persists clearance across fresh runners', async () => {
  const f = fixture()
  await f.store.load()
  await f.store.update(state => { state.spotify.retryAfterUntil = Date.now() - 1000 })
  const recovered = await runCloudSync(f.sync, { recoveryOnly: true })
  assert.equal(recovered.matchedCount, 1)
  assert.equal(f.store.state.spotify.retryAfterUntil, undefined)
  const next = new CloudStore(config, 'a1'.repeat(32), f.remote)
  await next.load()
  assert.equal(next.state.spotify.retryAfterUntil, undefined)
  f.sync.store = next
  f.calls.length = 0
  assert.equal((await runCloudSync(f.sync, { recoveryOnly: true })).reason, 'already-synced')
  assert.equal((await runCloudSync(f.sync)).reason, 'already-synced')
  assert.deepEqual(f.calls, [])
})

test('pending recovery still runs after an earlier same-day success, including at exact expiry', async () => {
  const now = new Date('2026-09-09T09:28:55Z')
  const calls = []
  const sync = { store: { state: { settings: { timezone: 'Asia/Shanghai' }, spotify: { retryAfterUntil: now.getTime() }, sync: { lastSyncedDate: '2026-09-09' } } },
    async run(options) { calls.push(options); return { ok: true } } }
  await runCloudSync(sync, { recoveryOnly: true }, now)
  assert.deepEqual(calls, [{ scheduled: false, requireExistingPlaylist: true, rejectEmptyMatches: true }])
})

test('failed recovery retains pending state for the next check', async () => {
  const f = fixture()
  await f.store.load()
  const deadline = Date.now() - 1000
  await f.store.update(state => { state.spotify.retryAfterUntil = deadline })
  f.spotify.searchTracks = async () => { throw new Error('temporary provider failure') }
  await assert.rejects(runCloudSync(f.sync, { recoveryOnly: true }), /temporary/)
  const next = new CloudStore(config, 'a1'.repeat(32), f.remote)
  await next.load()
  assert.equal(next.state.spotify.retryAfterUntil, deadline)
  assert.equal(next.state.sync.lastSyncedDate, undefined)
})

function policyFixture(lastSyncedDate = '2026-09-09', timezone = 'Asia/Shanghai') {
  const calls = []
  const state = { settings: { timezone }, spotify: {}, sync: { lastSyncedDate } }
  return { calls, state, sync: { store: { state }, async run(options) { calls.push(options); return { matchedCount: 1 } } } }
}

test('expected safety pause has an explicit pending result, not success or generic failure', async () => {
  const f = policyFixture()
  f.state.sync.checkpoint = { completed: 12 }
  f.sync.run = async () => { throw Object.assign(new Error('run-budget'), { pauseReason: 'run-budget', retryAt: Date.now() + 900000 }) }
  const run = await runCloudSync(f.sync)
  assert.equal(run.paused, true)
  assert.equal(run.completedSongs, 12)
  assert.equal(run.matchedCount, undefined)
  assert.match(cloudRunSummary(run), /not a completed sync/)
  assert.equal(f.state.sync.lastSyncedDate, '2026-09-09')
})

test('hourly catch-up runs at 08:00 and later if morning schedules were missed', async () => {
  for (const time of ['2026-09-10T00:00:00Z', '2026-09-10T03:35:00Z', '2026-09-10T15:35:00Z']) {
    const f = policyFixture()
    assert.equal((await runCloudSync(f.sync, { recoveryOnly: true }, new Date(time))).matchedCount, 1)
    assert.deepEqual(f.calls, [{ scheduled: true, requireExistingPlaylist: true, rejectEmptyMatches: true }])
  }
})

test('hourly catch-up skips a successful day without provider calls', async () => {
  const f = policyFixture('2026-09-10')
  assert.equal((await runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-10T03:35:00Z'))).reason, 'already-synced')
  assert.deepEqual(f.calls, [])
})

test('ordinary failed catch-up without cooldown remains eligible for next hourly check', async () => {
  const f = policyFixture()
  f.sync.run = async () => { throw new Error('temporary failure') }
  await assert.rejects(runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-10T03:35:00Z')), /temporary/)
  f.sync.run = async () => { f.calls.push('retry'); return { matchedCount: 1 } }
  await runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-10T04:35:00Z'))
  assert.deepEqual(f.calls, ['retry'])
})

test('catch-up uses configured timezone and does not sync at local midnight', async () => {
  const f = policyFixture('2026-09-09', 'UTC')
  assert.equal((await runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-10T00:35:00Z'))).reason, 'before-daily-window')
  assert.deepEqual(f.calls, [])
  await runCloudSync(f.sync, { recoveryOnly: true }, new Date('2026-09-10T08:00:00Z'))
  assert.equal(f.calls.length, 1)
})

test('expired cooldown may still recover before morning, while manual sync remains available', async () => {
  const now = new Date('2026-09-10T00:35:00+08:00')
  const f = policyFixture()
  f.state.spotify.retryAfterUntil = now.getTime()
  await runCloudSync(f.sync, { recoveryOnly: true }, now)
  assert.equal(f.calls[0].scheduled, false)
  const manual = policyFixture()
  await runCloudSync(manual.sync, {}, now)
  assert.equal(manual.calls.length, 1)
})
