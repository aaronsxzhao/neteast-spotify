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
  assert.equal((await runCloudSync(f.sync, { recoveryOnly: true })).reason, 'no-pending-recovery')
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
  assert.equal((await runCloudSync(f.sync, { recoveryOnly: true })).reason, 'no-pending-recovery')
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
