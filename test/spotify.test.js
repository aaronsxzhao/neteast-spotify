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
