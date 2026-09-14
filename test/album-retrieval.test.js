import test from 'node:test'
import assert from 'node:assert/strict'
import { SpotifyClient } from '../src/spotify.js'

function fixture(handler) {
  let now = Date.now()
  const calls = []
  const state = { settings: {}, spotify: { refreshToken: 'test', accessToken: 'test', expiresAt: now + 86400000 }, sync: { checkpoint: {} } }
  const store = { state, async update(fn) { fn(state) } }
  const fetch = async (url, options) => { calls.push(url); return handler(new URL(url), options) }
  const options = { now: () => now, sleep: async ms => { now += ms } }
  return { store, calls, client: new SpotifyClient(store, fetch, options), fresh: () => new SpotifyClient(store, fetch, options) }
}
const source = { name: 'Twelfth Song', ar: [{ name: 'Artist' }], al: { name: 'Distinctive Album' }, dt: 200000 }
const album = { id: 'a'.repeat(22), name: 'Distinctive Album', artists: [{ name: 'Artist' }] }

test('album traversal reads beyond search top ten, projects safe metadata and caches across runners', async () => {
  const f = fixture(url => url.pathname === '/v1/search' ? Response.json({ albums: { items: [album] } }) :
    Response.json({ next: null, items: Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: i === 11 ? source.name : `Song ${i}`, duration_ms: 200000,
      artists: [{ name: 'Artist' }], is_playable: i !== 3, privatePayload: 'never cached' })) }))
  const result = await f.client.findAlbumTracks(source)
  assert.equal(result.length, 12)
  assert.equal(result[11].name, source.name)
  assert.equal(result[11].album.name, album.name)
  assert.equal(result[3].is_playable, false)
  assert.equal(f.calls.length, 2)
  assert.doesNotMatch(JSON.stringify(f.store.state.sync.searchCache), /never cached/)
  assert.deepEqual(await f.fresh().findAlbumTracks(source), result)
  assert.equal(f.calls.length, 2)
})

test('album traversal never follows external next links and caps at two albums and two pages each', async () => {
  const f = fixture(url => url.pathname === '/v1/search' ? Response.json({ albums: { items: Array.from({ length: 5 }, (_, i) => ({ ...album, id: String(i).repeat(22) })) } }) :
    Response.json({ next: 'https://untrusted.example/private', items: [{ id: 'track', name: 'Song', artists: [] }] }))
  await f.client.findAlbumTracks(source)
  assert.equal(f.calls.length, 5)
  assert.ok(f.calls.every(url => new URL(url).origin === 'https://api.spotify.com'))
  assert.ok(f.calls.every(url => !url.includes('offset=100')))
})

test('saved cooldown and a new 429 stop album lookup with no bypass or retry', async () => {
  const f = fixture(() => new Response('', { status: 429, headers: { 'Retry-After': '900' } }))
  await assert.rejects(f.client.findAlbumTracks(source), { status: 429 })
  assert.equal(f.calls.length, 1)
  assert.ok(f.store.state.spotify.retryAfterUntil > Date.now())
  await assert.rejects(f.fresh().findAlbumTracks(source))
  assert.equal(f.calls.length, 1)
})

test('a pause during album pagination preserves the first page for the next runner', async () => {
  let fail = true
  const f = fixture(url => {
    if (url.pathname === '/v1/search') return Response.json({ albums: { items: [album] } })
    if (url.searchParams.get('offset') === '0') return Response.json({ next: 'more', items: [{ id: 'first', name: 'First' }] })
    if (fail) return new Response('', { status: 429, headers: { 'Retry-After': '0' } })
    return Response.json({ next: null, items: [{ id: 'last', name: source.name }] })
  })
  await assert.rejects(f.client.findAlbumTracks(source), { status: 429 })
  fail = false
  f.store.state.spotify.retryAfterUntil = Date.now() - 1
  const result = await f.fresh().findAlbumTracks(source)
  assert.equal(result.length, 2)
  assert.equal(f.calls.filter(url => url.includes('offset=0')).length, 1)
  assert.equal(f.calls.filter(url => url.includes('/search?')).length, 1)
})

test('new sync resets memory-only album data and market-restricted tracks remain unplayable', async () => {
  const f = fixture(url => url.pathname === '/v1/search' ? Response.json({ albums: { items: [album] } }) :
    Response.json({ next: null, items: [{ id: 'restricted', name: source.name, restrictions: { reason: 'market' } }] }))
  assert.equal((await f.client.findAlbumTracks(source))[0].is_playable, false)
  delete f.store.state.sync.checkpoint
  delete f.store.state.sync.searchCache
  await f.client.findAlbumTracks(source)
  assert.equal(f.calls.length, 2)
  f.client.beginRun()
  await f.client.findAlbumTracks(source)
  assert.equal(f.calls.length, 4)
})
