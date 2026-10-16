import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { titleVariants, scoreCandidate, pickBestMatch, sourceSongView, songSearchStages } from '../src/matcher.js'
import { classifySyncError, providerFailure, safeFailureDetails } from '../src/sync-errors.js'
import { createCloudAudit } from '../src/cloud-audit.js'
import { CloudStore } from '../src/cloud-state.js'
import { runCloudSync } from '../src/cloud-policy.js'
import { SpotifyClient } from '../src/spotify.js'
import { SyncService, dateInTimezone } from '../src/sync.js'

const config = { spotifyClientId: 'client', spotifyRefreshToken: 'private-token', neteaseCookie: 'MUSIC_U=private-cookie',
  playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
const key = 'a1'.repeat(32)
function memory() {
  return { text: null, async load() { return this.text }, async save(text) { this.text = text } }
}
const source = { id: 'oct16-fixture', name: 'A Specific Jazz Song', ar: [{ name: 'Original Singer' }], al: { name: 'Jazz Album' }, dt: 156995 }
const correct = { id: 'b'.repeat(22), uri: `spotify:track:${'b'.repeat(22)}`, name: source.name,
  artists: [{ id: 'singer', name: 'Original Singer' }], album: { name: 'Jazz Album' }, duration_ms: source.dt, is_playable: true }
// Synthetic catalog noise with the same empty-capture trigger as Oct 16. No
// account credentials, private recommendation report or live API is required.
const noisy = { id: 'c'.repeat(22), name: '☼⃝(̷̮͍͚̫)̵ () []', artists: [{ name: 'Unrelated Singer ()' }],
  album: { name: `ʅ͡͡()ʃ ${'̷͡⃝'.repeat(350)}` }, duration_ms: 261024 }

test('empty ASCII/full-width/nested brackets never crash title or bilingual metadata parsing', () => {
  for (const value of ['()', '[]', '【】', '( )', '[ ]', '（）', '［］', '((()))', '[[[]]]', '文字 () [] 【】', noisy.album.name]) {
    assert.doesNotThrow(() => titleVariants(value), value)
  }
  assert.deepEqual(titleVariants('曲名 () [ ] 【】 （English）'), ['曲名 () [ ] 【】 (English)', '曲名', 'English'])
  assert.deepEqual(titleVariants('曲名 (English)'), ['曲名 (English)', '曲名', 'English'])
  assert.deepEqual(titleVariants(''), [])
  assert.deepEqual(titleVariants(null), [])
})

test('a noisy candidate album cannot abort scoring or weaken title/artist/version checks', () => {
  assert.ok(Number.isFinite(scoreCandidate(source, noisy)))
  assert.equal(pickBestMatch(source, [noisy, correct]).candidate.id, correct.id)
  assert.equal(pickBestMatch(source, [{ ...correct, name: 'Different Composition ()' }]), null)
  assert.equal(pickBestMatch(source, [{ ...correct, artists: [{ name: 'Cover Singer ()' }] }]), null)
  assert.equal(pickBestMatch(source, [{ ...correct, name: `${source.name} (Instrumental) ()` }]), null)
  assert.equal(pickBestMatch(source, [{ ...correct, is_playable: false }]), null)
  for (const brackets of ['()', '[]', '（）', '( )', '[[[]]]']) {
    const decoratedSource = { ...source, name: `${source.name} ${brackets}`, al: { name: `Jazz Album ${brackets}` },
      ar: [{ name: `Original Singer ${brackets}` }] }
    assert.doesNotThrow(() => scoreCandidate(decoratedSource, { ...correct, name: `${correct.name} ${brackets}` }))
  }
})

test('fresh cloud runner resumes eight completed songs and cached noisy ninth-song results without another search', async () => {
  const remote = memory()
  const first = new CloudStore(config, key, remote)
  await first.load()
  const songs = [...Array.from({ length: 8 }, (_, i) => ({ ...source, id: `completed-${i}`, name: `Completed Song ${i}` })), source]
  const prior = songs.slice(0, 8).map((song, i) => ({ source: sourceSongView(song), spotify: {
    id: String(i).repeat(22), uri: `spotify:track:${String(i).repeat(22)}`, name: song.name,
  } }))
  const date = dateInTimezone(config.timezone)
  const signature = createHash('sha256').update(JSON.stringify({ version: 2, date, playlistId: config.playlistId,
    songs: songs.map(sourceSongView), retryUnmatched: false, retrySourceIds: [] })).digest('hex')
  const query = songSearchStages(source)[0].queries[0]
  const cacheKey = createHash('sha256').update(JSON.stringify([query, 10])).digest('hex')
  await first.update(state => {
    state.sync.checkpoint = { signature, date, completed: 8, matches: prior, unmatched: [] }
    state.sync.searchCache = { [cacheKey]: [noisy, correct] }
    state.spotify.requestTimes = [Date.now() - 1000]
  })
  const next = new CloudStore(config, key, remote)
  await next.load()
  const requests = [], waits = []
  let now = Date.now(), neteaseCalls = 0
  const client = new SpotifyClient(next, async (url, options) => {
    requests.push({ url, options })
    if (url.includes('/api/token')) return Response.json({ access_token: 'test', expires_in: 3600 })
    assert.ok(!url.includes('/search?'), 'cached ninth-song response must not be searched again')
    assert.ok(!url.includes('/images'), 'custom cover must not be changed')
    return new Response(null, { status: 204 })
  }, { now: () => now, sleep: async ms => { waits.push(ms); now += ms } })
  const run = await runCloudSync(new SyncService(next, client, async () => { neteaseCalls++; return songs }), { force: true })
  assert.equal(neteaseCalls, 1)
  assert.equal(run.sourceCount, 9)
  assert.equal(run.matchedCount, 9)
  assert.deepEqual(run.matches.slice(0, 8), prior)
  assert.equal(run.matches[8].spotify.id, correct.id)
  assert.equal(client.safety.stats.cacheHits, 1)
  assert.equal(client.safety.stats.requests, 3) // token, playlist PUT, metadata PUT
  assert.equal(client.safety.stats.retries, 0)
  assert.ok(waits.some(ms => ms >= 5000), 'persisted request reservation still enforces pacing')
  const playlist = requests.find(r => r.url.endsWith(`/playlists/${config.playlistId}/items`))
  assert.ok(playlist)
  assert.deepEqual(JSON.parse(playlist.options.body).uris, [...prior.map(m => m.spotify.uri), correct.uri])
  assert.equal(next.state.sync.checkpoint, undefined)
  assert.equal(next.state.sync.searchCache, undefined)
  assert.equal(next.state.spotify.retryAfterUntil, undefined)
})

test('provider boundary identifies real HTTP/network failures without disguising programming or auth errors', () => {
  for (const status of [408, 500, 502, 503, 504]) {
    assert.equal(classifySyncError(providerFailure('netease', { status })), 'provider-transient')
  }
  for (const error of [{ code: 'ECONNRESET' }, { name: 'TimeoutError' }, { name: 'AbortError' },
    Object.assign(new TypeError('PRIVATE_FETCH_MESSAGE'), { cause: { code: 'ENOTFOUND' } })]) {
    assert.equal(classifySyncError(providerFailure('netease', error)), 'provider-transient')
  }
  for (const status of [301, 401, 403]) assert.equal(classifySyncError(providerFailure('netease', { status })), 'authorization-required')
  assert.equal(classifySyncError(providerFailure('netease', { status: 400 })), 'provider-failure')
  assert.equal(classifySyncError(Object.assign(Error('private'), { source: 'spotify', status: 400, code: 'authorization-required' })), 'authorization-required')
  const bug = new TypeError('Cannot read properties of undefined (reading trim)')
  assert.equal(providerFailure('netease', bug), bug)
  assert.equal(classifySyncError(bug), 'program-error')
  assert.equal(classifySyncError(Object.assign(bug, { status: 503 })), 'program-error')
  assert.equal(classifySyncError(Object.assign(Error('temporary network outage'), { status: 503 })), 'unexpected-error', 'message/status alone is not provider provenance')
  assert.throws(() => providerFailure('unknown', {}), TypeError)
})

test('programming, authorization and unknown failures never create or extend transient backoff', async () => {
  for (const error of [new TypeError('private'), new RangeError('private'), new ReferenceError('private'), new SyntaxError('private'),
    Error('temporary provider failure'), providerFailure('netease', { status: 401 }), providerFailure('spotify', { status: 403 })]) {
    const state = { settings: { timezone: config.timezone }, spotify: { requestTimes: [1], retryAfterUntil: 1, transientFailures: 2 },
      sync: { checkpoint: { completed: 8 }, searchCache: { savedQuery: [noisy] } } }
    const before = structuredClone(state)
    let updates = 0
    const sync = { store: { state, async update(fn) { updates++; fn(state) } }, async run() { throw error } }
    await assert.rejects(runCloudSync(sync, { force: true }), e => e === error)
    assert.deepEqual(state, before, error.name)
    assert.equal(updates, 0)
  }
})

test('genuine provider outage keeps exponential backoff across fresh runners, and force does not bypass it', async () => {
  const remote = memory(), store = new CloudStore(config, key, remote)
  await store.load()
  await store.update(state => { state.sync.checkpoint = { completed: 8 } })
  const outage = providerFailure('netease', { code: 'ETIMEDOUT' })
  const started = Date.now()
  await assert.rejects(runCloudSync({ store, async run() { throw outage } }, { force: true }), e => e === outage)
  assert.equal(store.state.spotify.transientFailures, 1)
  assert.equal(store.state.spotify.pauseReason, 'transient-backoff')
  assert.ok(store.state.spotify.retryNotBefore >= started + 900000)
  const fresh = new CloudStore(config, key, remote)
  await fresh.load()
  let calls = 0
  const run = await runCloudSync({ store: fresh, async run() { calls++; } }, { force: true })
  assert.equal(run.reason, 'transient-backoff')
  assert.equal(calls, 0)
  assert.equal(fresh.state.sync.checkpoint.completed, 8)
})

test('Spotify 429 stops immediately and persists its full deadline without generic backoff', async () => {
  const remote = memory(), store = new CloudStore(config, key, remote)
  await store.load()
  let requests = 0, neteaseCalls = 0
  const now = Date.now()
  const spotify = new SpotifyClient(store, async () => {
    requests++
    return new Response('', { status: 429, headers: { 'retry-after': '3600' } })
  }, { now: () => now, sleep: async () => { throw Error('429 must not retry') } })
  const sync = new SyncService(store, spotify, async () => { neteaseCalls++; return [source] })
  const result = await runCloudSync(sync, { force: true })
  assert.equal(result.paused, true)
  assert.equal(result.reason, 'provider-cooldown')
  assert.equal(store.state.spotify.retryAfterUntil, now + 3600000)
  assert.equal(store.state.spotify.retryNotBefore, undefined)
  assert.equal(store.state.spotify.transientFailures, undefined)
  assert.equal(spotify.safety.stats.retries, 0)
  await runCloudSync(sync, { force: true })
  assert.equal(requests, 1)
  assert.equal(neteaseCalls, 1)
})

test('public error diagnostics expose bounded classification, never raw messages, stacks or custom names', () => {
  const lines = [], audit = createCloudAudit(line => lines.push(line))
  const error = new TypeError('PRIVATE_COOKIE_TOKEN_PROVIDER_BODY')
  audit('app-end', { phase: 'matching', result: 'failed', ...safeFailureDetails(error), message: error.message, stack: error.stack })
  const record = JSON.parse(lines[0].slice('DAILY_RELAY_AUDIT '.length))
  assert.equal(record.failureKind, 'program-error')
  assert.equal(record.errorType, 'TypeError')
  assert.equal(record.source, 'application')
  audit('app-end', { failureKind: 'PRIVATE', source: 'PRIVATE', errorType: 'PRIVATE', code: 'PRIVATE' })
  assert.doesNotMatch(lines.join(''), /PRIVATE/)
  assert.equal(safeFailureDetails({ name: 'PRIVATE', source: 'PRIVATE' }).errorType, 'Error')
})
