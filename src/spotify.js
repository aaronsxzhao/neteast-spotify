import { createHash, randomBytes } from 'node:crypto'
import { SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from './config.js'
import { RequestSafety } from './request-safety.js'

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
  constructor(store, fetchImpl = fetch, safetyOptions = {}) {
    this.store = store
    this.safety = new RequestSafety(store, safetyOptions)
    this.fetch = (url, options) => this.safety.fetch(fetchImpl, url, options)
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
        ...data.spotify,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: Date.now() + result.expires_in * 1000 - 30_000,
        scope: result.scope || SPOTIFY_SCOPES.join(' '),
        connectedAt: new Date().toISOString(),
      }
      delete data.spotify.oauth
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
    const cooldown = Number(this.store.state.spotify.retryAfterUntil || 0) - Date.now()
    if (cooldown > 0) {
      const error = new Error('Spotify provider cooldown is still active')
      error.status = 429
      error.retryAfterSeconds = Math.ceil(cooldown / 1000)
      throw error
    }
    const token = await this.accessToken()
    const response = await this.fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })

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
    // Per-song checkpoints clear this cache. A crashed/incomplete song resumes
    // successful queries, including empty results, without repeating requests.
    const key = createHash('sha256').update(JSON.stringify([query, limit])).digest('hex')
    const cache = this.store.state.sync?.searchCache
    if (cache && Object.hasOwn(cache, key)) {
      this.safety.stats.cacheHits++
      return cache[key]
    }
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) })
    const result = await this.request(`/search?${params}`)
    const tracks = (result?.tracks?.items || []).map(track => ({
      id: track.id, uri: track.uri, name: track.name, duration_ms: track.duration_ms,
      is_playable: track.is_playable,
      artists: track.artists?.map(artist => ({ id: artist.id, name: artist.name })),
      album: { id: track.album?.id, name: track.album?.name,
        images: track.album?.images?.slice(-1).map(image => ({ url: image.url })) },
      external_urls: { spotify: track.external_urls?.spotify },
    }))
    if (this.store.state.sync?.checkpoint) {
      await this.store.update(state => {
        state.sync.searchCache ||= {}
        state.sync.searchCache[key] = tracks
      })
    }
    return tracks
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
