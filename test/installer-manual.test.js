import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { request } from 'node:http'
import { Store } from '../src/store.js'
import { runManualSync } from '../src/installer-manual.js'
import { createInstallerServer } from '../src/installer-server.js'

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'relay-manual-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store({ directory }); await store.load()
  await store.update(s => { s.settings.neteaseCookie = 'MUSIC_U=fake'; s.settings.spotifyClientId = 'a'.repeat(32); s.spotify.refreshToken = 'fake-refresh' })
  return store
}
const songs = [{ id: 1, name: 'Example Song', ar: [{ name: 'Example Artist' }], al: { name: 'Example Album' }, dt: 180000 }]
function fakeSpotify() {
  const calls = { create: 0, search: 0, replace: 0 }
  return { calls, safety: { check() {}, beginRun() {} },
    async createPlaylist(name, isPublic) { calls.create++; assert.equal(isPublic, false); return { id: 'playlist', external_urls: { spotify: 'https://open.spotify.com/playlist/playlist' } } },
    async searchTracks() { calls.search++; return [{ id: 'track', uri: 'spotify:track:track', name: 'Example Song', artists: [{ name: 'Example Artist' }], album: { name: 'Example Album' }, duration_ms: 180000 }] },
    async replacePlaylist(id, uris) { calls.replace++; assert.equal(id, 'playlist'); assert.deepEqual(uris, ['spotify:track:track']) },
    async updatePlaylist() {},
  }
}
async function serverFixture(t, store, options = {}) {
  const origin = 'http://127.0.0.1:18787'
  const app = await createInstallerServer({ store, origin, session: 'manual-test', ...options })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => app.server.close(resolve)))
  const send = (route, body) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: app.server.address().port, path: route, method: body === undefined ? 'GET' : 'POST',
      headers: { host: '127.0.0.1:18787', origin, cookie: 'relay_session=manual-test', 'content-type': 'application/json' } }, res => {
      let text = ''; res.on('data', c => { text += c }); res.on('end', () => resolve({ code: res.statusCode, body: JSON.parse(text) }))
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
  return { app, send }
}
async function idle(send) {
  for (let i = 0; i < 200; i++) {
    const status = (await send('/api/status')).body
    if (!status.busy) return status
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Test job did not finish')
}

test('manual sync works with only music accounts, reuses its playlist and keeps local schedules off', async t => {
  const store = await fixture(t); const spotify = fakeSpotify()
  const result = await runManualSync(store, spotify, async () => songs)
  assert.equal(result.matchedCount, 1); assert.equal(store.state.installer, undefined)
  assert.equal(store.state.settings.scheduleEnabled, false)
  await runManualSync(store, spotify, async () => songs)
  assert.equal(spotify.calls.create, 1)
})

test('manual sync saves its destination before failures and resumes completed matching without another playlist', async t => {
  const store = await fixture(t); const spotify = fakeSpotify(); const replace = spotify.replacePlaylist
  spotify.replacePlaylist = async () => { throw Object.assign(new Error('temporary'), { status: 503 }) }
  await assert.rejects(runManualSync(store, spotify, async () => songs))
  assert.equal(store.state.sync.playlistId, 'playlist')
  const searches = spotify.calls.search; spotify.replacePlaylist = replace
  await runManualSync(store, spotify, async () => songs)
  assert.equal(spotify.calls.create, 1); assert.equal(spotify.calls.search, searches)
})

test('manual sync refuses cloud-owned state and active cooldown before any music calls', async t => {
  const store = await fixture(t); const spotify = fakeSpotify(); let recommendations = 0
  for (const installation of [{ deployed: true }, { repository: 'friend/repo' }, { maintenance: true }]) {
    store.state.installer = installation
    await assert.rejects(runManualSync(store, spotify, async () => { recommendations++; return songs }), /云端/)
  }
  delete store.state.installer
  spotify.safety.check = () => { throw new Error('cooldown') }
  await assert.rejects(runManualSync(store, spotify, async () => { recommendations++; return songs }), /cooldown/)
  assert.equal(recommendations, 0); assert.equal(spotify.calls.create, 0)
})

test('manual HTTP endpoint requires consent/accounts and performs no GitHub operations for local sync', async t => {
  const store = await fixture(t); const spotify = fakeSpotify()
  const { send } = await serverFixture(t, store, { spotifyClient: spotify, getRecommendations: async () => songs })
  assert.equal((await send('/api/sync', {})).code, 400)
  const token = store.state.spotify.refreshToken; delete store.state.spotify.refreshToken
  assert.equal((await send('/api/sync', { consent: true })).code, 400)
  store.state.spotify.refreshToken = token
  const result = await send('/api/sync', { consent: true }); assert.equal(result.code, 202); assert.equal(result.body.mode, 'local')
  const status = await idle(send)
  assert.equal(status.manual.status, 'done'); assert.equal(status.manual.matchedCount, 1); assert.equal(status.github.status, 'idle')
  assert.ok(!JSON.stringify(status).includes('fake-refresh')); assert.ok(!JSON.stringify(status).includes('Example Song'))
})

test('manual HTTP run rejects overlapping deployment/login and coalesces repeated sync clicks', async t => {
  const store = await fixture(t); let release; const waiting = new Promise(resolve => { release = resolve })
  const { send } = await serverFixture(t, store, { spotifyClient: fakeSpotify(), getRecommendations: async () => { await waiting; return songs } })
  await send('/api/sync', { consent: true })
  try {
    assert.equal((await send('/api/sync', { consent: true })).body.running, true)
    assert.equal((await send('/api/deploy', { consent: true })).code, 400)
    assert.equal((await send('/api/spotify/connect', { clientId: 'a'.repeat(32) })).code, 400)
    assert.equal((await send('/api/exit', {})).code, 400)
  } finally { release(); await idle(send) }
})

test('manual HTTP button routes deployed installs to GitHub and never falls back to local music calls', async t => {
  const store = await fixture(t); const spotify = fakeSpotify(); await store.update(s => { s.installer = { deployed: true, repository: 'friend/repo' } })
  const { app, send } = await serverFixture(t, store, { spotifyClient: spotify, getRecommendations: async () => { throw Error('must not run') } })
  let dispatched = 0; app.github.dispatch = async () => { dispatched++; return { submitted: true } }
  assert.equal((await send('/api/sync', { consent: true })).body.mode, 'cloud')
  assert.equal(dispatched, 1); assert.equal(spotify.calls.create, 0)
  app.github.dispatch = async () => { throw new Error('private upstream failure') }
  const failure = await send('/api/sync', { consent: true })
  assert.equal(failure.code, 400); assert.ok(!JSON.stringify(failure).includes('private upstream'))
  assert.equal(spotify.calls.create, 0)
})

test('saved cooldown blocks manual HTTP sync with no provider requests', async t => {
  const store = await fixture(t); const spotify = fakeSpotify(); const until = Date.now() + 60000
  await store.update(s => { s.spotify.retryAfterUntil = until })
  const { send } = await serverFixture(t, store, { spotifyClient: spotify, getRecommendations: async () => { throw Error('must not run') } })
  const result = await send('/api/sync', { consent: true })
  assert.equal(result.body.paused, true); assert.equal(result.body.until, until); assert.equal(spotify.calls.create, 0)
})
