import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudStore } from '../src/cloud-state.js'
import { SyncService } from '../src/sync.js'
import { SpotifyClient } from '../src/spotify.js'

const config = { spotifyClientId: 'client', spotifyRefreshToken: 'test', neteaseCookie: 'MUSIC_U=test', playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
const key = 'ab'.repeat(32)
const sources = ['Alpha Specific Song', 'Beta Specific Song'].map((name, i) => ({ id: i + 1, name, ar: [{ name: 'Singer' }], dt: 200000 }))
sources[1].alia = ['Beta Alternate Title']
const candidate = source => ({ id: String(source.id), uri: `spotify:track:${source.id}`, name: source.name, artists: source.ar, duration_ms: source.dt })

for (const failure of ['503', 'budget']) test(`fresh cloud runner resumes songs and partial queries after ${failure} without changing playlist early`, async () => {
  const remote = { text: null, async load() { return this.text }, async save(text) { this.text = text } }
  let now = Date.now()
  const options = { now: () => now, sleep: async ms => { now += ms } }
  const queries = []; const writes = []
  let fail = true; let betaCount = 0
  const fetch = async (url, options) => {
    if (url.includes('/api/token')) return Response.json({ access_token: 'test', expires_in: 3600 })
    if (url.includes('/search?')) {
      const q = new URL(url).searchParams.get('q')
      queries.push(q)
      if (q.includes('Beta') && ++betaCount === 2 && fail && failure === '503') return new Response('', { status: 503 })
      return Response.json({ tracks: { items: sources.filter(s => q.includes(s.name)).map(candidate) } })
    }
    writes.push({ url, body: JSON.parse(options.body) })
    return new Response(null, { status: 204 })
  }
  const first = new CloudStore(config, key, remote)
  await first.load()
  await assert.rejects(new SyncService(first, new SpotifyClient(first, fetch, { ...options, maxPerRun: failure === 'budget' ? 3 : 60 }), async () => sources).run(),
    { pauseReason: failure === 'budget' ? 'request-budget' : 'transient-backoff' })
  assert.equal(first.state.sync.checkpoint.completed, 1)
  assert.equal(writes.length, 0)
  const previousQueries = [...queries]
  assert.ok(Object.keys(first.state.sync.searchCache).length > 0)
  const second = new CloudStore(config, key, remote)
  await second.load()
  now = second.state.spotify.retryNotBefore + 1
  fail = false
  queries.length = 0
  const client = new SpotifyClient(second, fetch, options)
  const run = await new SyncService(second, client, async () => sources).run()
  assert.equal(run.matchedCount, 2)
  assert.ok(!queries.some(q => q.includes('Alpha')))
  assert.ok(!queries.includes(previousQueries.find(q => q.includes('Beta'))), 'first successful Beta query must come from cache')
  assert.ok(client.safety.stats.cacheHits > 0)
  assert.deepEqual(writes[0].body.uris, ['spotify:track:1', 'spotify:track:2'])
  assert.equal(second.state.sync.checkpoint, undefined)
  assert.equal(second.state.sync.searchCache, undefined)
  assert.equal(second.state.spotify.retryNotBefore, undefined)
  assert.ok(second.state.spotify.requestTimes.length > 0, 'success must not erase rolling budget')
})

test('a failed playlist write resumes with no repeated searches; changed source invalidates checkpoint', async () => {
  const state = { settings: { ...config, neteaseCookie: 'MUSIC_U=test' }, spotify: { refreshToken: 'test' }, sync: { playlistId: config.playlistId } }
  const store = { state, async update(fn) { fn(state) } }
  let searches = 0; let failWrite = true
  const spotify = { async searchTracks() { searches++; return sources.map(candidate) },
    async replacePlaylist() { if (failWrite) throw Error('temporary write failure') }, async updatePlaylist() {} }
  await assert.rejects(new SyncService(store, spotify, async () => sources).run(), /temporary write/)
  assert.equal(state.sync.checkpoint.completed, 2)
  const previous = searches
  failWrite = false
  await new SyncService(store, spotify, async () => sources).run()
  assert.equal(searches, previous)
  failWrite = true
  await assert.rejects(new SyncService(store, spotify, async () => sources).run())
  const beforeChange = searches
  failWrite = false
  await new SyncService(store, spotify, async () => [...sources].reverse()).run()
  assert.ok(searches > beforeChange)
})

test('local direct sync during a safety pause makes no NetEase requests', async () => {
  const store = new CloudStore(config, key, { async save() {}, async load() {} })
  store.state.spotify.retryNotBefore = Date.now() + 60000
  const client = new SpotifyClient(store, async () => { throw Error('must not fetch') })
  await assert.rejects(new SyncService(store, client, async () => { throw Error('must not fetch NetEase') }).run(), { pauseReason: 'local-backoff' })
})

test('a different local day invalidates saved song decisions and queries', async () => {
  const store = { state: { settings: { timezone: 'Pacific/Kiritimati', neteaseCookie: 'MUSIC_U=test' }, spotify: { refreshToken: 'test' }, sync: { playlistId: config.playlistId } }, async update(fn) { fn(this.state) } }
  let searches = 0
  const spotify = { async searchTracks() { searches++; return sources.map(candidate) }, async replacePlaylist() { throw Error('write failed') } }
  await assert.rejects(new SyncService(store, spotify, async () => sources).run())
  const before = searches
  const day = store.state.sync.checkpoint.date
  store.state.settings.timezone = 'Etc/GMT+12'
  await assert.rejects(new SyncService(store, spotify, async () => sources).run())
  assert.notEqual(store.state.sync.checkpoint.date, day)
  assert.ok(searches > before)
})
