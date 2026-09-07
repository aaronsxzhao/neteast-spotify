import test from 'node:test'
import assert from 'node:assert/strict'
import { dateInTimezone, hourInTimezone, SyncService } from '../src/sync.js'

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
