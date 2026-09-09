import test from 'node:test'
import assert from 'node:assert/strict'
import { dateInTimezone, hourInTimezone, SyncService } from '../src/sync.js'
import { sourceSongView } from '../src/matcher.js'

test('explicit unmatched repair reuses only unchanged same-day matches in source order', async () => {
  const a = { id: 1, name: 'Alpha', ar: [{ name: 'Singer' }], dt: 200000 }
  const b = { id: 2, name: 'Beta', ar: [{ name: 'Singer' }], dt: 210000 }
  const c = { id: 3, name: 'Gamma', ar: [{ name: 'Singer' }], dt: 220000 }
  const state = {
    settings: { neteaseCookie: 'MUSIC_U=test', timezone: 'Asia/Shanghai' },
    spotify: { refreshToken: 'test' },
    sync: { playlistId: 'playlist', lastSuccessfulRun: {
      date: dateInTimezone('Asia/Shanghai'), playlistId: 'playlist',
      matches: [
        { source: sourceSongView(a), spotify: { uri: 'spotify:track:a' } },
        { source: { ...sourceSongView(c), durationMs: 190000 }, spotify: { uri: 'spotify:track:stale' } },
      ],
    } },
  }
  const queries = []; let written
  const spotify = {
    async searchTracks(query) {
      queries.push(query)
      return [a, b, c].map(s => ({ id: String(s.id), uri: `spotify:track:${s.id}`, name: s.name, artists: s.ar, duration_ms: s.dt }))
    },
    async replacePlaylist(id, uris) { written = uris },
    async updatePlaylist() {},
  }
  const store = { state, async update(fn) { fn(state) } }
  const service = new SyncService(store, spotify, async () => [b, a, c])
  await service.run({ retryUnmatched: true })
  assert.deepEqual(written, ['spotify:track:2', 'spotify:track:a', 'spotify:track:3'])
  assert.ok(!queries.some(q => q.includes('Alpha')))
  assert.ok(queries.some(q => q.includes('Gamma')))
  queries.length = 0
  await service.run()
  assert.ok(queries.some(q => q.includes('Alpha')), 'ordinary sync must not reuse old decisions')
  state.sync.lastSuccessfulRun.date = '2000-01-01'
  queries.length = 0
  await service.run({ retryUnmatched: true })
  assert.ok(queries.some(q => q.includes('Alpha')), 'never reuse a previous day')
})

test('schedule helpers respect the configured timezone', () => {
  const instant = new Date('2026-08-31T16:30:00.000Z')
  assert.equal(dateInTimezone('Asia/Shanghai', instant), '2026-09-01')
  assert.equal(hourInTimezone('Asia/Shanghai', instant), 0)
  assert.equal(dateInTimezone('America/Los_Angeles', instant), '2026-08-31')
})

test('sync preserves order and leaves unrelated songs unmatched', async () => {
  const state = {
    settings: {
      neteaseCookie: 'MUSIC_U=test',
      playlistName: 'Daily mirror',
      playlistPublic: false,
      timezone: 'Asia/Shanghai',
    },
    spotify: { refreshToken: 'test' },
    sync: { history: [] },
  }
  const store = {
    state,
    async update(mutator) { await mutator(state) },
  }
  const candidate = {
    id: 'spotify-1',
    uri: 'spotify:track:spotify-1',
    name: 'Blinding Lights',
    artists: [{ name: 'The Weeknd' }],
    album: { name: 'After Hours', images: [] },
    duration_ms: 200_100,
    external_urls: { spotify: 'https://open.spotify.com/track/spotify-1' },
  }
  const calls = { replaced: [] }
  const spotify = {
    async searchTracks(query) { return query.includes('Blinding') ? [candidate] : [] },
    async createPlaylist() { return { id: 'playlist-1', external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-1' } } },
    async replacePlaylist(id, uris) { calls.replaced.push({ id, uris }) },
    async updatePlaylist() {},
  }
  const songs = [
    { id: 1, name: 'Blinding Lights', ar: [{ name: 'The Weeknd' }], al: { name: 'After Hours' }, dt: 200_040 },
    { id: 2, name: 'A NetEase-only recording', ar: [{ name: 'Unknown' }], al: { name: 'Demo' }, dt: 180_000 },
  ]
  const service = new SyncService(store, spotify, async () => songs)

  const result = await service.run()

  assert.equal(result.matchedCount, 1)
  assert.equal(result.unmatchedCount, 1)
  assert.deepEqual(calls.replaced[0], { id: 'playlist-1', uris: ['spotify:track:spotify-1'] })
  assert.equal(state.sync.lastRun.ok, true)
})

test('sync uses bilingual metadata and title-only fallback before writing the playlist', async () => {
  const state = {
    settings: { neteaseCookie: 'MUSIC_U=test', playlistName: 'Daily mirror', timezone: 'Asia/Shanghai' },
    spotify: { refreshToken: 'test' }, sync: { playlistId: 'existing', history: [] },
  }
  const store = { state, async update(mutator) { await mutator(state) } }
  const songs = [{ id: 1, name: '새 아침 (New Morning)', ar: [{ name: '새가수' }], dt: 200_000 }]
  const candidate = { id: 'translated', uri: 'spotify:track:translated', name: 'New Morning', artists: [{ name: 'New Singer' }], duration_ms: 200_100 }
  let written
  const spotify = {
    async searchTracks(query) { return query === 'track:"New Morning"' ? [candidate] : [] },
    async replacePlaylist(id, uris) { written = { id, uris } },
    async updatePlaylist() {},
  }
  const run = await new SyncService(store, spotify, async () => songs).run()
  assert.equal(run.matchedCount, 1)
  assert.equal(run.matches[0].searchStage, 'title-only')
  assert.deepEqual(written, { id: 'existing', uris: ['spotify:track:translated'] })
})
