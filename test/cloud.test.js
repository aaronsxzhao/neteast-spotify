import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudStore, GitHubState, parseConfig, encryptState, decryptState } from '../src/cloud-state.js'
import { SyncService, dateInTimezone } from '../src/sync.js'

const config = { spotifyClientId: 'client', spotifyRefreshToken: 'seed-token', neteaseCookie: 'MUSIC_U=private-cookie', playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
const key = 'a1'.repeat(32)
function remoteMemory() {
  return { text: null, writes: 0, async load() { return this.text }, async save(text) { this.text = text; this.writes++ } }
}

test('cloud config requires credentials and a fixed destination playlist', () => {
  assert.equal(parseConfig(JSON.stringify(config)).playlistId, config.playlistId)
  for (const name of ['spotifyClientId', 'spotifyRefreshToken', 'neteaseCookie', 'playlistId']) {
    assert.throws(() => parseConfig(JSON.stringify({ ...config, [name]: '' })), /missing/)
  }
  assert.throws(() => parseConfig('invalid'), /valid JSON/)
  assert.throws(() => parseConfig(JSON.stringify({ ...config, playlistPublic: 'false' })), /boolean/)
})

test('state encryption hides secrets, uses random nonces, and rejects tampering/wrong keys', () => {
  const value = { token: 'test-private-token', playlistId: 'private-playlist' }
  const encrypted = encryptState(value, key)
  assert.deepEqual(decryptState(encrypted, key), value)
  assert.equal(encrypted.includes(value.token), false)
  assert.notEqual(encryptState(value, key), encrypted)
  assert.throws(() => decryptState(encrypted, 'b1'.repeat(32)), /Cannot decrypt/)
  const tampered = JSON.parse(encrypted)
  const bytes = Buffer.from(tampered.ciphertext, 'base64'); bytes[0] ^= 1
  tampered.ciphertext = bytes.toString('base64')
  assert.throws(() => decryptState(JSON.stringify(tampered), key), /Cannot decrypt/)
  assert.throws(() => encryptState({}, 'short'), /64 hexadecimal/)
})

test('rotated token survives a failed sync and the next fresh runner', async () => {
  const remote = remoteMemory()
  const store = new CloudStore(config, key, remote)
  await store.load()
  await store.update((state) => { state.spotify.refreshToken = 'rotated-token'; state.spotify.accessToken = 'temporary' })
  await store.update((state) => { state.spotify.retryAfterUntil = 1800000000000 })
  await store.update((state) => { state.sync.lastRun = { ok: false, error: 'failure' } })
  const next = new CloudStore(config, key, remote)
  await next.load()
  assert.equal(next.state.spotify.refreshToken, 'rotated-token')
  assert.equal(next.state.spotify.accessToken, undefined)
  assert.equal(next.state.spotify.retryAfterUntil, 1800000000000)
  assert.equal(next.state.sync.lastSyncedDate, undefined)
  const decrypted = decryptState(remote.text, key)
  assert.equal(JSON.stringify(decrypted).includes('private-cookie'), false)
  assert.equal(decrypted.sync.lastRun, undefined)
})

test('updated config supersedes encrypted token; wrong key fails closed', async () => {
  const remote = remoteMemory()
  const store = new CloudStore(config, key, remote)
  await store.load()
  await store.update((state) => { state.spotify.refreshToken = 'rotated-token' })
  const updated = new CloudStore({ ...config, spotifyRefreshToken: 'reauthorized-token' }, key, remote)
  await updated.load()
  assert.equal(updated.state.spotify.refreshToken, 'reauthorized-token')
  await assert.rejects(new CloudStore(config, 'bb'.repeat(32), remote).load(), /Cannot decrypt/)
})

test('successful track report persists encrypted and survives subsequent failures', async () => {
  const remote = remoteMemory()
  const store = new CloudStore(config, key, remote)
  await store.load()
  const report = { ok: true, date: '2026-09-08', matches: [{ source: { name: 'private-song' } }], unmatched: [] }
  await store.update(state => { state.sync.lastSuccessfulRun = report })
  await store.update(state => { state.sync.lastRun = { ok: false, error: 'unsafe-provider-body' } })
  const next = new CloudStore(config, key, remote)
  await next.load()
  assert.deepEqual(next.state.sync.lastSuccessfulRun, report)
  assert.equal(remote.text.includes('private-song'), false)
  assert.equal(JSON.stringify(decryptState(remote.text, key)).includes('unsafe-provider-body'), false)
})

test('successful date persists and recovery runs skip until a forced manual run', async () => {
  const remote = remoteMemory()
  const store = new CloudStore(config, key, remote)
  await store.load()
  await store.update((state) => { state.sync.lastSyncedDate = dateInTimezone('Asia/Shanghai') })
  const next = new CloudStore(config, key, remote)
  await next.load()
  let calls = 0
  const service = new SyncService(next, {}, async () => { calls++; throw new Error('forced test') })
  assert.equal((await service.run({ scheduled: true })).skipped, true)
  assert.equal(calls, 0)
  await assert.rejects(service.run({ scheduled: false }), /forced test/)
  assert.equal(calls, 1)
})

test('cloud run preserves existing playlist when all matches fail or target disappears', async () => {
  const remote = remoteMemory()
  const store = new CloudStore(config, key, remote)
  await store.load()
  const source = { name: 'A Test Track', ar: [{ name: 'Artist' }], dt: 200_000 }
  let writes = 0
  const spotify = {
    async searchTracks() { return [] },
    async createPlaylist() { throw new Error('must not create') },
    async replacePlaylist() { writes++; const error = new Error('missing target'); error.status = 404; throw error },
  }
  const service = new SyncService(store, spotify, async () => [source])
  await assert.rejects(service.run({ requireExistingPlaylist: true, rejectEmptyMatches: true }), /No confident matches/)
  assert.equal(writes, 0)
  spotify.searchTracks = async () => [{ id: 'test', uri: 'spotify:track:test', name: source.name, artists: source.ar, duration_ms: source.dt }]
  await assert.rejects(service.run({ requireExistingPlaylist: true }), /missing target/)
  assert.equal(store.state.sync.lastSyncedDate, undefined)
  assert.equal(store.state.sync.playlistId, config.playlistId)
})

test('GitHub state uses a separate branch, tracks file SHAs, and uploads only encrypted text', async () => {
  const requests = []
  const remote = new GitHubState({ repository: 'owner/repo', token: 'github-token', commit: 'a'.repeat(40), fetchImpl: async (url, options) => {
    requests.push({ url, options })
    if (url.includes('/git/ref/')) return new Response('', { status: 404 })
    return Response.json(options.method === 'PUT' ? { content: { sha: 'saved-sha' } } : {})
  } })
  assert.equal(await remote.load(), null)
  const encrypted = encryptState({ token: 'private' }, key)
  await remote.save(encrypted)
  await remote.save(encrypted)
  assert.equal(JSON.parse(requests[1].options.body).ref, 'refs/heads/daily-relay-state')
  const upload = JSON.parse(requests[3].options.body)
  assert.equal(upload.sha, 'saved-sha')
  assert.equal(upload.branch, 'daily-relay-state')
  assert.equal(Buffer.from(upload.content, 'base64').toString(), encrypted)
})

test('state storage permission errors abort before provider actions and never echo response secrets', async () => {
  const remote = new GitHubState({ repository: 'owner/repo', token: 'token', commit: 'a'.repeat(40), fetchImpl: async () => new Response('secret-value', { status: 403 }) })
  await assert.rejects(remote.load(), (error) => error.status === 403 && !error.message.includes('secret-value'))
  await assert.rejects(new CloudStore(config, key, remote).load(), /403/)
})
