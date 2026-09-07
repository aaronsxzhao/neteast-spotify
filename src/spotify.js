import { createHash, randomBytes } from 'node:crypto'
import { SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from './config.js'

const API_BASE = 'https://api.spotify.com/v1'
const ACCOUNTS_BASE = 'https://accounts.spotify.com'

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function readResponse(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class SpotifyClient {
  constructor(store, fetchImpl = fetch) {
    this.store = store
    this.fetch = fetchImpl
  }

  async beginAuthorization(action = null) {
    const clientId = this.store.state.settings.spotifyClientId
    if (!clientId) throw new Error('Save a Spotify Client ID first')

    const verifier = base64url(randomBytes(64))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(24))
    await this.store.update((data) => {
      data.spotify.oauth = { verifier, state, action, createdAt: Date.now() }
    })

    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SPOTIFY_SCOPES.join(' '),
      show_dialog: 'true',
    })
    return `${ACCOUNTS_BASE}/authorize?${query}`
  }

  async completeAuthorization(code, state) {
    const oauth = this.store.state.spotify.oauth
    if (!oauth || oauth.state !== state || Date.now() - oauth.createdAt > 10 * 60_000) {
      throw new Error('Spotify login state is invalid or expired; please try connecting again')
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: this.store.state.settings.spotifyClientId,
      code_verifier: oauth.verifier,
    })
    const response = await this.fetch(`${ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result?.error_description || result?.error || 'Spotify login failed')

    await this.store.update((data) => {
      data.spotify = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: Date.now() + result.expires_in * 1000 - 30_000,
        scope: result.scope || SPOTIFY_SCOPES.join(' '),
        connectedAt: new Date().toISOString(),
      }
    })
    const profile = await this.request('/me')
    await this.store.update((data) => {
      data.spotify.profile = { id: profile.id, displayName: profile.display_name || profile.id }
    })
    return { profile, action: oauth.action }
  }

  async disconnect() {
    await this.store.update((data) => {
      data.spotify = {}
    })
  }

  async accessToken() {
    const spotify = this.store.state.spotify
    if (!spotify.refreshToken) throw new Error('Connect Spotify first')
    if (spotify.accessToken && spotify.expiresAt > Date.now()) return spotify.accessToken

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: spotify.refreshToken,
      client_id: this.store.state.settings.spotifyClientId,
    })
    const response = await this.fetch(`${ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    const result = await readResponse(response)
    if (!response.ok) {
      if (result?.error === 'invalid_grant') {
        await this.disconnect()
        throw new Error('Spotify authorization expired; connect Spotify again')
      }
      throw new Error(result?.error_description || result?.error || 'Could not refresh Spotify login')
    }
    await this.store.update((data) => {
      data.spotify.accessToken = result.access_token
      data.spotify.expiresAt = Date.now() + result.expires_in * 1000 - 30_000
      if (result.refresh_token) data.spotify.refreshToken = result.refresh_token
      if (result.scope) data.spotify.scope = result.scope
    })
    return result.access_token
  }

  async request(path, options = {}, attempt = 0) {
    const token = await this.accessToken()
    const response = await this.fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })

    if (response.status === 429 && attempt < 2) {
      const waitSeconds = Math.min(Number(response.headers.get('retry-after') || 1), 10)
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
      return this.request(path, options, attempt + 1)
    }

    if (response.status === 401 && attempt === 0) {
      await this.store.update((data) => { data.spotify.expiresAt = 0 })
      return this.request(path, options, attempt + 1)
    }

    const result = await readResponse(response)
    if (!response.ok) {
      const message = result?.error?.message || result?.error_description || `Spotify returned HTTP ${response.status}`
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return result
  }

  async searchTracks(query, limit = 10) {
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) })
    const result = await this.request(`/search?${params}`)
    return result?.tracks?.items || []
  }

  async createPlaylist(name, isPublic) {
    return this.request('/me/playlists', {
      method: 'POST',
      body: JSON.stringify({
        name,
        public: isPublic,
        description: 'A daily mirror of NetEase Cloud Music recommendations.',
      }),
    })
  }

  async replacePlaylist(playlistId, uris) {
    await this.request(`/playlists/${playlistId}/items`, {
      method: 'PUT',
      body: JSON.stringify({ uris: uris.slice(0, 100) }),
    })
    for (let index = 100; index < uris.length; index += 100) {
      await this.request(`/playlists/${playlistId}/items`, {
        method: 'POST',
        body: JSON.stringify({ uris: uris.slice(index, index + 100) }),
      })
    }
  }

  async updatePlaylist(playlistId, details) {
    return this.request(`/playlists/${playlistId}`, {
      method: 'PUT',
      body: JSON.stringify(details),
    })
  }

  hasScope(scope) {
    return String(this.store.state.spotify.scope || '').split(/\s+/).includes(scope)
  }

  async uploadPlaylistCover(playlistId, jpegBase64) {
    return this.request(`/playlists/${playlistId}/images`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: jpegBase64,
    })
  }
}
