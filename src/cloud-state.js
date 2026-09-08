import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { DEFAULT_SETTINGS } from './config.js'

const BRANCH = 'daily-relay-state'
const FILE = 'state.enc'

export function parseConfig(text) {
  let config
  try { config = JSON.parse(text) } catch { throw new Error('DAILY_RELAY_CONFIG must be valid JSON') }
  for (const key of ['spotifyClientId', 'spotifyRefreshToken', 'neteaseCookie', 'playlistId']) {
    if (typeof config?.[key] !== 'string' || !config[key].trim()) throw new Error(`DAILY_RELAY_CONFIG is missing ${key}`)
  }
  if (!config.neteaseCookie.includes('MUSIC_U=')) throw new Error('NetEase cookie must contain MUSIC_U')
  if (!/^[a-zA-Z0-9]{22}$/.test(config.playlistId)) throw new Error('Invalid Spotify playlist ID')
  new Intl.DateTimeFormat('en', { timeZone: config.timezone || DEFAULT_SETTINGS.timezone })
  if (config.playlistPublic !== undefined && typeof config.playlistPublic !== 'boolean') throw new Error('playlistPublic must be a boolean')
  return config
}

function keyBytes(key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('DAILY_RELAY_STATE_KEY must be 64 hexadecimal characters')
  return Buffer.from(key, 'hex')
}

export function encryptState(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv)
  cipher.setAAD(Buffer.from('daily-relay-state-v1'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })
}

export function decryptState(text, key) {
  try {
    const data = JSON.parse(text)
    if (data.version !== 1) throw new Error('Unsupported state format')
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(data.iv, 'base64'))
    decipher.setAAD(Buffer.from('daily-relay-state-v1'))
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
  } catch { throw new Error('Cannot decrypt cloud state. Restore the original DAILY_RELAY_STATE_KEY; do not silently discard rotated tokens.') }
}

export class GitHubState {
  constructor({ repository, token, commit, fetchImpl = fetch }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token || !/^[a-f0-9]{40}$/.test(commit || '')) {
      throw new Error('Missing GitHub Actions repository, token, or commit context')
    }
    this.base = `https://api.github.com/repos/${repository}`
    this.token = token
    this.commit = commit
    this.fetch = fetchImpl
    this.sha = undefined
  }

  async request(path, options = {}, missing = false) {
    const response = await this.fetch(this.base + path, {
      ...options,
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    })
    if (missing && response.status === 404) return null
    if (!response.ok) {
      const error = new Error(`GitHub state storage returned HTTP ${response.status}; verify Actions contents:write permission and branch rules`)
      error.status = response.status
      throw error
    }
    return response.status === 204 ? null : response.json()
  }

  async load() {
    const ref = await this.request(`/git/ref/heads/${BRANCH}`, {}, true)
    if (!ref) {
      await this.request('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: this.commit }) })
      return null
    }
    const file = await this.request(`/contents/${FILE}?ref=${BRANCH}`, {}, true)
    if (!file) return null
    this.sha = file.sha
    return Buffer.from(file.content, 'base64').toString('utf8')
  }

  async save(text) {
    const result = await this.request(`/contents/${FILE}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'Persist encrypted Daily Relay state', branch: BRANCH, sha: this.sha, content: Buffer.from(text).toString('base64') }),
    })
    this.sha = result.content.sha
  }
}

export class CloudStore {
  constructor(config, key, remote) {
    keyBytes(key)
    this.key = key
    this.remote = remote
    this.config = config
    // Reauthorizing or replacing the config resets persisted credentials to the new seed.
    this.seed = createHash('sha256').update(JSON.stringify(config)).digest('hex')
    this.state = {
      settings: { ...DEFAULT_SETTINGS, spotifyClientId: config.spotifyClientId, neteaseCookie: config.neteaseCookie,
        playlistName: config.playlistName || DEFAULT_SETTINGS.playlistName, playlistPublic: config.playlistPublic ?? false,
        timezone: config.timezone || DEFAULT_SETTINGS.timezone },
      spotify: { refreshToken: config.spotifyRefreshToken, scope: config.spotifyScope || '' },
      sync: { playlistId: config.playlistId, playlistUrl: `https://open.spotify.com/playlist/${config.playlistId}`, history: [] },
    }
    this.persisted = ''
  }

  snapshot() {
    const { spotify, sync } = this.state
    return { seed: this.seed, spotify: { refreshToken: spotify.refreshToken, scope: spotify.scope },
      sync: { playlistId: sync.playlistId, playlistUrl: sync.playlistUrl, lastSyncedDate: sync.lastSyncedDate } }
  }

  async load() {
    const encrypted = await this.remote.load()
    if (encrypted) {
      const saved = decryptState(encrypted, this.key)
      if (saved.seed === this.seed) {
        this.state.spotify = saved.spotify
        this.state.sync = { ...this.state.sync, ...saved.sync }
      }
    }
    // Check persistence before making any Spotify changes.
    await this.save()
    return this.state
  }

  async update(mutator) {
    await mutator(this.state)
    // Persist refresh-token rotation immediately, not only on successful sync.
    await this.save()
    return this.state
  }

  async save() {
    const snapshot = this.snapshot()
    const serialized = JSON.stringify(snapshot)
    if (serialized === this.persisted) return
    await this.remote.save(encryptState(snapshot, this.key))
    this.persisted = serialized
  }
}
