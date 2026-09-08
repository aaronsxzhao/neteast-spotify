import test from 'node:test'
import assert from 'node:assert/strict'
import { SpotifyClient } from '../src/spotify.js'

test('uploads a base64 JPEG with the custom-cover content type', async () => {
  const state = {
    settings: { spotifyClientId: 'client-id' },
    spotify: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
      scope: 'playlist-modify-private ugc-image-upload',
    },
  }
  const calls = []
  const store = {
    state,
    async update(mutator) { await mutator(state) },
  }
  const spotify = new SpotifyClient(store, async (url, options) => {
    calls.push({ url, options })
    return { status: 202, ok: true, text: async () => '' }
  })

  assert.equal(spotify.hasScope('ugc-image-upload'), true)
  await spotify.uploadPlaylistCover('playlist-1', '/9j/example')

  assert.equal(calls[0].url, 'https://api.spotify.com/v1/playlists/playlist-1/images')
  assert.equal(calls[0].options.method, 'PUT')
  assert.equal(calls[0].options.headers['content-type'], 'image/jpeg')
  assert.equal(calls[0].options.body, '/9j/example')
})

test('search pacing and Retry-After respect provider cooldowns longer than ten seconds', async () => {
  const waits = []
  let calls = 0
  const store = { state: { spotify: { accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 60000 } } }
  const client = new SpotifyClient(store, async () => ++calls === 1
    ? { status: 429, headers: new Headers({ 'retry-after': '45' }) }
    : new Response(JSON.stringify({ tracks: { items: [] } })), { sleep: async ms => waits.push(ms) })
  assert.deepEqual(await client.searchTracks('example'), [])
  assert.deepEqual(waits, [350, 45000])
  assert.equal(calls, 2)
})

test('a cooldown beyond the run budget stops without retrying early', async () => {
  let calls = 0
  const store = { state: { spotify: { accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 60000 } } }
  const client = new SpotifyClient(store, async () => {
    calls++
    return { status: 429, headers: new Headers({ 'retry-after': '3600' }) }
  }, { sleep: async () => {} })
  await assert.rejects(client.searchTracks('example'), error => error.status === 429 && error.retryAfterSeconds === 3600)
  assert.equal(calls, 1)
})
