import test from 'node:test'
import assert from 'node:assert/strict'
import { cachedTrackIds, saveTrackHints } from '../src/match-cache.js'
import { sourceSongView } from '../src/matcher.js'
import { SyncService } from '../src/sync.js'
import { CloudStore } from '../src/cloud-state.js'
import { SpotifyClient } from '../src/spotify.js'

const source = { id: 1, name: 'A Distinctive Song', ar: [{ name: 'Singer' }], al: { name: 'Album' }, dt: 200000 }
const id = 'a'.repeat(22)
const candidate = { id, uri: `spotify:track:${id}`, name: source.name, artists: source.ar,
  album: source.al, duration_ms: source.dt, is_playable: true }
const savedMatch = { source: sourceSongView(source), spotify: { id, uri: candidate.uri }, searchStage: 'metadata' }
const newState = () => ({ settings: { spotifyClientId: 'client', neteaseCookie: 'test', timezone: 'Asia/Shanghai' },
  spotify: { refreshToken: 'test' }, sync: { playlistId: 'playlist' } })

test('hints are bounded, expire, and invalidate on source metadata, scope or version changes', () => {
  const state = newState(), now = 100000000000
  saveTrackHints(state, [savedMatch], [], now)
  assert.deepEqual(cachedTrackIds(state, savedMatch.source, now + 1), [id])
  assert.deepEqual(cachedTrackIds(state, { ...savedMatch.source, durationMs: 1 }, now + 1), [])
  assert.deepEqual(cachedTrackIds(state, { ...savedMatch.source, artistNames: [['Other']] }, now + 1), [])
  assert.deepEqual(cachedTrackIds(state, savedMatch.source, now - 1), [])
  assert.deepEqual(cachedTrackIds(state, savedMatch.source, now + 30 * 86400000), [])
  state.sync.playlistId = 'other'
  assert.deepEqual(cachedTrackIds(state, savedMatch.source, now + 1), [])
  state.sync.playlistId = 'playlist'; state.sync.confirmedTrackHints.version = 0
  assert.deepEqual(cachedTrackIds(state, savedMatch.source, now + 1), [])
  saveTrackHints(state, Array.from({ length: 450 }, (_, i) => ({ ...savedMatch, source: { ...savedMatch.source, id: i } })), [], now)
  assert.equal(Object.keys(state.sync.confirmedTrackHints.entries).length, 400)
})

test('misses evict old hints and same-day reuse does not extend their age', () => {
  const state = newState(), now = Date.now()
  saveTrackHints(state, [savedMatch], [], now)
  saveTrackHints(state, [{ ...savedMatch, searchStage: 'same-day-confirmed' }], [], now + 1000)
  assert.equal(Object.values(state.sync.confirmedTrackHints.entries)[0].at, now)
  saveTrackHints(state, [], [{ ...savedMatch.source, diagnostics: { reason: 'no-results' } }], now + 1000)
  assert.deepEqual(cachedTrackIds(state, savedMatch.source), [])
})

test('next-day sync revalidates a cached ID, preserving playlist order with no searches', async () => {
  const state = newState(), writes = [], lookups = []
  saveTrackHints(state, [savedMatch], [], Date.now() - 86400000)
  const store = { state, async update(fn) { fn(state) } }
  const spotify = {
    async findKnownTracks(song, { ids, takeQuery }) { lookups.push(ids); return takeQuery() ? [candidate] : [] },
    async searchTracks() { throw Error('should not search after fresh verification') },
    async replacePlaylist(_, uris) { writes.push(uris) }, async updatePlaylist() {},
  }
  const run = await new SyncService(store, spotify, async () => [source]).run()
  assert.deepEqual(lookups, [[id]])
  assert.deepEqual(writes, [[candidate.uri]])
  assert.equal(run.matches[0].searchDiagnostics.knownTrackQueryCount, 1)
  assert.equal(run.matches[0].searchDiagnostics.queryCount, 0)
})

test('denied, wrong or missing cached recordings fall back; cached identity never bypasses scoring', async () => {
  for (const result of [[{ ...candidate, is_playable: false }], [{ ...candidate, name: 'Wrong Song' }], []]) {
    const state = newState(); saveTrackHints(state, [savedMatch], [])
    const store = { state, async update(fn) { fn(state) } }
    let searched = 0
    const replacement = { ...candidate, id: 'b'.repeat(22), uri: `spotify:track:${'b'.repeat(22)}` }
    const spotify = {
      async findKnownTracks(_, { takeQuery }) { return takeQuery() ? result : [] },
      async searchTracks() { searched++; return [replacement] },
      async replacePlaylist() {}, async updatePlaylist() {},
    }
    const run = await new SyncService(store, spotify, async () => [source]).run()
    assert.equal(run.matches[0].spotify.id, replacement.id)
    assert.equal(searched, 1)
    assert.equal(run.matches[0].searchDiagnostics.catalogQueryCount, 2)
  }
})

test('cached-ID 429 propagates immediately with no fallback searches or playlist writes', async () => {
  const state = newState(); saveTrackHints(state, [savedMatch], [])
  const store = { state, async update(fn) { fn(state) } }
  const spotify = {
    async findKnownTracks(_, { takeQuery }) { assert.ok(takeQuery()); throw Object.assign(Error('cooldown'), { status: 429 }) },
    async searchTracks() { assert.fail('must not search') }, async replacePlaylist() { assert.fail('must not write') },
  }
  await assert.rejects(new SyncService(store, spotify, async () => [source]).run(), { status: 429 })
})

test('hint cache persists encrypted across cloud runners and resets when config changes', async () => {
  const config = { spotifyClientId: 'client', spotifyRefreshToken: 'test', neteaseCookie: 'test', playlistId: id }
  const remote = { async load() { return this.text }, async save(text) { this.text = text } }
  const first = new CloudStore(config, 'ab'.repeat(32), remote); await first.load()
  await first.update(state => saveTrackHints(state, [savedMatch], []))
  assert.ok(!remote.text.includes(id))
  const next = new CloudStore(config, 'ab'.repeat(32), remote); await next.load()
  assert.deepEqual(cachedTrackIds(next.state, savedMatch.source), [id])
  const reauthorized = new CloudStore({ ...config, spotifyRefreshToken: 'other' }, 'ab'.repeat(32), remote)
  await reauthorized.load()
  assert.deepEqual(cachedTrackIds(reauthorized.state, savedMatch.source), [])
})

test('Spotify adapter validates hint IDs and never treats unknown availability as playable', async () => {
  const state = newState(); let now = Date.now(), calls = 0
  Object.assign(state.spotify, { accessToken: 'test', expiresAt: now + 86400000 })
  const store = { state, async update(fn) { fn(state) } }
  const client = new SpotifyClient(store, async url => {
    calls++; assert.ok(String(url).endsWith(`/tracks/${id}`))
    return Response.json({ ...candidate, is_playable: undefined })
  }, { now: () => now, sleep: async ms => { now += ms } })
  assert.deepEqual(await client.findKnownTracks(source, { ids: ['../../other'] }), [])
  const tracks = await client.findKnownTracks(source, { ids: [id] })
  assert.equal(calls, 1)
  assert.equal(tracks[0].is_playable, false)
  assert.equal(tracks[0].catalogAvailability, 'unknown')
})
