import test from 'node:test'
import assert from 'node:assert/strict'
import { RequestSafety, retryDeadline, migrateRequestBudget } from '../src/request-safety.js'
import { SpotifyClient } from '../src/spotify.js'
import { CloudStore, decryptState } from '../src/cloud-state.js'
import { runCloudSync } from '../src/cloud-policy.js'

const config = { spotifyClientId: 'client', spotifyRefreshToken: 'test', neteaseCookie: 'MUSIC_U=test', playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
const key = 'aa'.repeat(32)
function fixture() {
  let time = Date.parse('2026-09-10T03:00:00Z')
  const waits = []
  const remote = { text: null, async load() { return this.text }, async save(text) { this.text = text } }
  const store = new CloudStore(config, key, remote)
  const options = { now: () => time, sleep: async ms => { waits.push(ms); time += ms } }
  return { store, remote, options, waits, advance(ms) { time += ms } }
}

test('serializes concurrent requests, paces them and counts auth/search/writes together', async () => {
  const f = fixture()
  const guard = new RequestSafety(f.store, f.options)
  const calls = []
  const fetch = async url => { calls.push(url); return new Response('{}') }
  await Promise.all(['token', 'search', 'write'].map(url => guard.fetch(fetch, url)))
  assert.deepEqual(calls, ['token', 'search', 'write'])
  assert.deepEqual(f.waits, [6000, 6000])
  assert.equal(guard.stats.requests, 3)
  assert.equal(f.store.state.spotify.requestTimes.length, 3)
})

test('rolling budget survives runner restart and blocks force without any provider calls', async () => {
  const f = fixture()
  const guard = new RequestSafety(f.store, { ...f.options, maxPerHour: 2 })
  let requests = 0
  const fetch = async () => { requests++; return new Response('{}') }
  await guard.fetch(fetch, 'search')
  await guard.fetch(fetch, 'search')
  const next = new CloudStore(config, key, f.remote)
  await next.load()
  const second = new RequestSafety(next, { ...f.options, maxPerHour: 2 })
  await assert.rejects(second.fetch(fetch, 'search'), { pauseReason: 'request-budget' })
  assert.equal(requests, 2)
  const sync = { store: next, async run() { throw Error('must not run') } }
  assert.equal((await runCloudSync(sync, { force: true }, new Date(f.options.now()))).reason, 'request-budget')
  f.advance(61 * 60_000)
  await second.fetch(fetch, 'search')
  assert.equal(requests, 3)
})

test('per-run budget stops even when the rolling budget allows more', async () => {
  const f = fixture()
  const guard = new RequestSafety(f.store, { ...f.options, maxPerRun: 1 })
  await guard.fetch(async () => new Response('{}'), 'one')
  await assert.rejects(guard.fetch(async () => { throw Error('must not fetch') }, 'two'), { pauseReason: 'run-budget' })
  f.advance(61 * 60_000)
  guard.beginRun()
  await guard.fetch(async () => new Response('{}'), 'later local sync')
  assert.equal(guard.stats.requests, 1)
})

test('default budget completes more than 60 requests without an hour pause', async () => {
  const f = fixture()
  const guard = new RequestSafety(f.store, f.options)
  const sent = []
  for (let i = 0; i < 65; i++) await guard.fetch(async () => { sent.push(f.options.now()); return new Response('{}') }, 'search')
  assert.equal(guard.stats.requests, 65)
  assert.equal(f.store.state.spotify.retryNotBefore, undefined)
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i] - sent[i - 1] >= 6000)
})

test('rolling window waits in place across a fresh runner, then resumes', async () => {
  const f = fixture()
  await f.store.update(s => { s.spotify.requestTimes = Array(5).fill(f.options.now()) })
  const next = new CloudStore(config, key, f.remote); await next.load()
  const start = f.options.now()
  const guard = new RequestSafety(next, { ...f.options, minIntervalMs: 0 })
  await guard.fetch(async () => new Response('{}'), 'search')
  assert.equal(f.options.now() - start, 30000)
  assert.equal(next.state.spotify.retryNotBefore, undefined)
})

test('a provider cooldown appearing during a pacing wait prevents sending', async () => {
  const f = fixture()
  await f.store.update(s => { s.spotify.requestTimes = [f.options.now()] })
  const guard = new RequestSafety(f.store, { ...f.options, sleep: async ms => {
    f.advance(ms); f.store.state.spotify.retryAfterUntil = f.options.now() + 60000
  } })
  await assert.rejects(guard.fetch(async () => { throw Error('must not send') }, 'search'), { pauseReason: 'provider-cooldown' })
  assert.equal(guard.stats.requests, 0)
})

test('budget migration clears only legacy local pause, retaining real cooldown and progress', async () => {
  for (const reason of ['request-budget', 'transient-backoff', 'run-budget']) {
    const f = fixture()
    await f.store.update(s => { Object.assign(s.spotify, { pauseReason: reason, retryNotBefore: 999, retryAfterUntil: 888, requestTimes: [100] }); s.sync.checkpoint = { completed: 12 } })
    await migrateRequestBudget(f.store)
    const next = new CloudStore(config, key, f.remote); await next.load()
    assert.equal(next.state.spotify.retryNotBefore, reason === 'request-budget' ? undefined : 999)
    assert.equal(next.state.spotify.retryAfterUntil, 888)
    assert.deepEqual(next.state.spotify.requestTimes, [100])
    assert.equal(next.state.sync.checkpoint.completed, 12)
    assert.equal(next.state.spotify.budgetPolicyVersion, 2)
  }
})

test('persistent 503 and network failures stop after two read retries and preserve backoff', async () => {
  const f = fixture()
  const guard = new RequestSafety(f.store, f.options)
  let calls = 0
  await assert.rejects(guard.fetch(async () => { calls++; return new Response('private error', { status: 503 }) }, 'search'), { status: 503, pauseReason: 'transient-backoff' })
  assert.equal(f.store.state.spotify.retryNotBefore, f.options.now() + 15 * 60_000)
  await assert.rejects(guard.fetch(async () => { calls++ }, 'search'), { pauseReason: 'transient-backoff' })
  assert.equal(calls, 3)
  f.advance(16 * 60_000)
  const next = new CloudStore(config, key, f.remote)
  await next.load()
  const second = new RequestSafety(next, f.options)
  await assert.rejects(second.fetch(async () => { throw Error('private URL and credentials') }, 'search'), { pauseReason: 'transient-backoff' })
  assert.equal(next.state.spotify.retryNotBefore, f.options.now() + 30 * 60_000)
  assert.ok(!JSON.stringify(decryptState(f.remote.text, key)).includes('private'))
})

test('a single 502 on a read retries in the same run, persists its wait, then clears it', async () => {
  const f = fixture(); const guard = new RequestSafety(f.store, f.options)
  let calls = 0
  const response = await guard.fetch(async () => {
    calls++
    if (calls === 2) assert.equal(f.store.state.spotify.pauseReason, 'transient-retry')
    return new Response('{}', { status: calls === 1 ? 502 : 200 })
  }, 'search')
  assert.equal(response.status, 200); assert.equal(calls, 2)
  assert.equal(guard.stats.retries, 1); assert.equal(guard.stats.requests, 2)
  assert.equal(f.store.state.spotify.retryNotBefore, undefined)
  assert.ok(f.waits.reduce((a, b) => a + b, 0) >= 6000)
})

test('a 429 after a 502 immediately ends read retries and persists the full provider wait', async () => {
  const f = fixture(); const guard = new RequestSafety(f.store, f.options); let calls = 0
  await assert.rejects(guard.fetch(async () => ++calls === 1 ? new Response('', { status: 502 }) :
    new Response('', { status: 429, headers: { 'retry-after': '3600' } }), 'search'), { pauseReason: 'provider-cooldown' })
  assert.equal(calls, 2); assert.equal(f.store.state.spotify.retryAfterUntil, f.options.now() + 3600000)
})

test('token and playlist writes are not replayed; long Retry-After is never shortened', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const f = fixture(); const guard = new RequestSafety(f.store, f.options); let calls = 0
    await assert.rejects(guard.fetch(async () => { calls++; return new Response('', { status: 502 }) }, 'write', { method }), { pauseReason: 'transient-backoff' })
    assert.equal(calls, 1)
  }
  const f = fixture(); const guard = new RequestSafety(f.store, f.options); let calls = 0
  await assert.rejects(guard.fetch(async () => { calls++; return new Response('', { status: 503, headers: { 'retry-after': '1800' } }) }, 'search'), { pauseReason: 'transient-backoff' })
  assert.equal(calls, 1); assert.equal(f.store.state.spotify.retryNotBefore, f.options.now() + 1800000)
})

test('429 on token endpoint persists deadline and a fresh runner makes zero requests', async () => {
  const f = fixture()
  const client = new SpotifyClient(f.store, async () => new Response('', { status: 429, headers: { 'retry-after': '22444' } }), f.options)
  await assert.rejects(client.accessToken(), { status: 429 })
  assert.equal(f.store.state.spotify.retryAfterUntil, f.options.now() + 22444000)
  const next = new CloudStore(config, key, f.remote)
  await next.load()
  const guard = new RequestSafety(next, f.options)
  await assert.rejects(guard.fetch(async () => { throw Error('must not fetch') }, 'search'), { status: 429 })
  assert.equal(guard.stats.requests, 0)
})

test('Retry-After supports seconds, HTTP dates and safe missing-header fallback', () => {
  const now = Date.parse('2026-09-10T03:00:00Z')
  assert.equal(retryDeadline('45', now), now + 45000)
  assert.equal(retryDeadline('Thu, 10 Sep 2026 04:00:00 GMT', now), now + 3600000)
  for (const value of [null, '', 'garbage', '-1']) assert.equal(retryDeadline(value, now), now + 60000)
})

test('request reservation persistence failure prevents outgoing requests', async () => {
  const f = fixture()
  f.remote.save = async () => { throw Error('storage unavailable') }
  const guard = new RequestSafety(f.store, f.options)
  await assert.rejects(guard.fetch(async () => { throw Error('must not fetch') }, 'search'), /storage unavailable/)
  assert.equal(guard.stats.requests, 0)
})

test('incomplete query results including empty results persist encrypted across runners', async () => {
  const f = fixture()
  f.store.state.spotify.accessToken = 'test'
  f.store.state.spotify.expiresAt = Date.now() + 600000
  f.store.state.sync.checkpoint = { signature: 'test' }
  const client = new SpotifyClient(f.store, async () => Response.json({ tracks: { items: [] } }), f.options)
  assert.deepEqual(await client.searchTracks('query with private listening metadata'), [])
  const next = new CloudStore(config, key, f.remote)
  await next.load()
  const second = new SpotifyClient(next, async () => { throw Error('must not fetch') }, f.options)
  assert.deepEqual(await second.searchTracks('query with private listening metadata'), [])
  assert.equal(second.safety.stats.requests, 0)
  assert.equal(second.safety.stats.cacheHits, 1)
  assert.ok(!f.remote.text.includes('private listening'))
})
