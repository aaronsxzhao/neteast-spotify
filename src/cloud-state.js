import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { DEFAULT_SETTINGS, resolvePlaylistName } from './config.js'

const BRANCH = 'daily-relay-state'
const FILE = 'state.enc'

function storageError(operation, status, code = 'storage-unavailable') {
  return Object.assign(new Error(`GitHub state storage ${operation} failed (${status || 'network'}; ${code})`),
    { source: 'github-state', operation, status, code })
}

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
  constructor({ repository, token, commit, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onDiagnostic = () => {} }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token || !/^[a-f0-9]{40}$/.test(commit || '')) {
      throw new Error('Missing GitHub Actions repository, token, or commit context')
    }
    this.base = `https://api.github.com/repos/${repository}`
    this.token = token
    this.commit = commit
    this.fetch = fetchImpl
    this.sha = undefined
    this.text = null
    this.sleep = sleep
    this.onDiagnostic = onDiagnostic
    this.queue = Promise.resolve()
  }

  diagnostic(fields) {
    try { this.onDiagnostic({ source: 'github-state', operation: 'write', ...fields }) } catch { /* Best effort. */ }
  }

  async request(path, options = {}, missing = false) {
    const operation = options.method === 'PUT' ? 'write' : options.method === 'POST' ? 'create' : 'read'
    let response
    try { response = await this.fetch(this.base + path, {
      ...options,
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    }) } catch { throw storageError(operation, undefined, 'network-error') }
    if (missing && response.status === 404) return null
    if (!response.ok) {
      throw storageError(operation, response.status)
    }
    try { return response.status === 204 ? null : await response.json() }
    catch { throw storageError(operation, undefined, 'invalid-response') }
  }

  async readFile() {
    const file = await this.request(`/contents/${FILE}?ref=${BRANCH}`, {}, true)
    if (!file) return { sha: undefined, text: null }
    if (!file.sha || typeof file.content !== 'string' || file.encoding !== 'base64') {
      throw storageError('read', undefined, 'invalid-response')
    }
    return { sha: file.sha, text: Buffer.from(file.content, 'base64').toString('utf8') }
  }

  async load() {
    const ref = await this.request(`/git/ref/heads/${BRANCH}`, {}, true)
    if (!ref) {
      await this.request('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: this.commit }) })
      return null
    }
    const file = await this.readFile()
    this.sha = file.sha
    this.text = file.text
    return file.text
  }

  save(text) {
    // A rejected queue stays rejected; a fresh runner must load authoritative state.
    this.queue = this.queue.then(() => this.write(text))
    return this.queue
  }

  async write(text) {
    const baseline = this.text
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.request(`/contents/${FILE}`, {
          method: 'PUT',
          body: JSON.stringify({ message: 'Persist encrypted Daily Relay state', branch: BRANCH, sha: this.sha, content: Buffer.from(text).toString('base64') }),
        })
        if (!result?.content?.sha) throw storageError('write', undefined, 'invalid-response')
        this.sha = result.content.sha
        this.text = text
        return
      } catch (error) {
        const recoverable = error.source === 'github-state' &&
          (!error.status || error.status === 409 || error.status >= 500)
        this.diagnostic({ result: recoverable ? 'checking' : 'failed', status: error.status, attempt })
        if (!recoverable) throw error
        // A PUT may succeed server-side even if its response is lost. Read back
        // before retrying, using the exact same ciphertext as a receipt.
        const current = await this.readFile()
        if (current.text === text) {
          this.sha = current.sha
          this.text = text
          this.diagnostic({ result: 'already-persisted', attempt })
          return
        }
        if (current.text !== baseline) {
          this.diagnostic({ result: 'external-change', status: 409, attempt })
          throw storageError('write', 409, 'state-changed')
        }
        // Refresh only if still at our baseline. Never overwrite another
        // writer's credentials, cooldowns or checkpoints with local state.
        this.sha = current.sha
        if (attempt === 3) throw error
        this.diagnostic({ result: 'retrying', status: error.status, attempt })
        await this.sleep(attempt === 1 ? 1000 : 3000)
      }
    }
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
        playlistName: resolvePlaylistName(config.playlistName), playlistPublic: config.playlistPublic ?? false,
        timezone: config.timezone || DEFAULT_SETTINGS.timezone },
      spotify: { refreshToken: config.spotifyRefreshToken, scope: config.spotifyScope || '' },
      sync: { playlistId: config.playlistId, playlistUrl: `https://open.spotify.com/playlist/${config.playlistId}`, history: [] },
    }
    this.persisted = ''
    this.queue = Promise.resolve()
  }

  snapshot() {
    const { spotify, sync } = this.state
    return { seed: this.seed, spotify: { refreshToken: spotify.refreshToken, scope: spotify.scope, retryAfterUntil: spotify.retryAfterUntil,
      requestTimes: spotify.requestTimes, retryNotBefore: spotify.retryNotBefore, pauseReason: spotify.pauseReason,
      transientFailures: spotify.transientFailures, budgetPolicyVersion: spotify.budgetPolicyVersion },
      sync: { playlistId: sync.playlistId, playlistUrl: sync.playlistUrl, lastSyncedDate: sync.lastSyncedDate,
        // Successful app-generated metadata only, never provider error bodies.
        lastSuccessfulRun: sync.lastSuccessfulRun, checkpoint: sync.checkpoint, searchCache: sync.searchCache,
        confirmedTrackHints: sync.confirmedTrackHints } }
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

  update(mutator) {
    this.queue = this.queue.then(async () => {
      await mutator(this.state)
      // Serialize mutations with their snapshots, including token rotation.
      await this.persist()
      return this.state
    })
    return this.queue
  }

  save() {
    this.queue = this.queue.then(() => this.persist())
    return this.queue
  }

  async persist() {
    const snapshot = this.snapshot()
    const serialized = JSON.stringify(snapshot)
    if (serialized === this.persisted) return
    await this.remote.save(encryptState(snapshot, this.key))
    this.persisted = serialized
  }
}
