import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, songSearchStages, MAX_SONG_CATALOG_QUERIES } from '../src/matcher.js'
import { SpotifyClient } from '../src/spotify.js'

const source = { name: 'Distinctive Song', ar: [{ name: 'Singer' }], al: { name: 'Original Album' }, dt: 200000 }
const track = (id = 'hit', overrides = {}) => ({ id, uri: `spotify:track:${id}`, name: source.name,
  artists: [{ id: 'singer', name: 'Singer' }], album: { name: 'Compilation Album' }, duration_ms: 201000, ...overrides })

test('an unambiguous near-exact same-primary recording stops after one query despite another album', async () => {
  let calls = 0
  const diagnostics = {}
  const match = await findTrackMatch(source, async () => { calls++; return [track()] }, diagnostics)
  assert.equal(match.candidate.id, 'hit')
  assert.equal(match.earlyExit, true)
  assert.equal(calls, 1)
  assert.equal(match.searchDiagnostics.catalogQueryCount, 1)
  assert.equal(diagnostics.queryCount, 1)
})

test('same-title covers cannot earn the new early stop, and exact source recording beats alternatives in the pool', async () => {
  const wrong = track('wrong', { artists: [{ name: 'Other Singer' }] })
  assert.equal(await findTrackMatch(source, async () => [wrong], {}, { allowAlternateVersions: true }), null)
  const match = await findTrackMatch(source, async () => [
    track('live', { name: `${source.name} - Live`, duration_ms: 280000 }), track('exact'),
  ], {}, { allowAlternateVersions: true })
  assert.equal(match.candidate.id, 'exact')
  assert.ok(!match.alternateVersion)
})

test('a permitted alternate stops after filtered and title-only searches, not every fallback', async () => {
  const queries = []
  const match = await findTrackMatch(source, async q => { queries.push(q); return [track('live', { name: source.name + ' - Live', duration_ms: 280000 })] }, {}, { allowAlternateVersions: true })
  assert.equal(match.alternateVersion, true)
  assert.ok(queries.some(q => q.startsWith('track:') && !q.includes('artist:')))
  assert.ok(queries.length <= 3)
  assert.ok(!queries.some(q => q.includes('album:')))
})

test('two consecutive repeated candidate responses move to another strategy, without ending all retrieval', async () => {
  const verbose = { ...source, tns: ['Second Name', 'Third Name', 'Fourth Name'] }
  const queries = [], diagnostics = {}
  const match = await findTrackMatch(verbose, async q => {
    queries.push(q)
    return q === `track:"${source.name}"` ? [track()] : [track('unrelated', { name: 'Unrelated', artists: [{ name: 'Other' }] })]
  }, diagnostics)
  assert.equal(match.candidate.id, 'hit')
  assert.equal(queries.filter(q => q.includes('artist:')).length, 3)
  assert.ok(diagnostics.stoppedStages.some(s => s.reason === 'no-new-candidates'))
})

test('genuine translated titles precede typography permutations', () => {
  const stages = songSearchStages({ ...source, name: 'ラブ・スコール', tns: ['Love Squall'] })
  assert.match(stages[0].queries[1], /Love Squall/)
  assert.match(stages.find(s => s.name === 'free-text').queries[0], /Singer/)
})

test('global budget includes album queries and second pass; misses are explicitly marked for review', async () => {
  const verbose = { ...source, id: 468490434, name: 'ラブ・スコール (2021 Version)',
    ar: [{ name: '大野雄二' }, { name: 'Fujikochans' }], tns: ['Title Two', 'Title Three', 'Title Four'] }
  for (const maxQueries of [0, 5, 18, 1000]) {
    let calls = 0
    const diagnostics = {}
    const miss = () => [track(String(++calls), { name: 'Definitely Unrelated', artists: [{ name: 'Another Singer' }] })]
    const result = await findTrackMatch(verbose, async () => miss(), diagnostics, {
      maxQueries, allowAlternateVersions: true,
      findAlbumTracks: async (_, { takeQuery }) => {
        const items = []
        for (let i = 0; i < 6 && takeQuery(); i++) items.push(...miss())
        return items
      },
    })
    assert.equal(result, null)
    assert.ok(calls <= Math.min(maxQueries, MAX_SONG_CATALOG_QUERIES))
    assert.equal(calls, diagnostics.catalogQueryCount)
    assert.equal(diagnostics.catalogQueryCount, diagnostics.queryCount + diagnostics.albumQueryCount)
    assert.equal(diagnostics.queryLimitsApplied, true)
    assert.equal(diagnostics.reviewRequired, true)
    if (maxQueries >= 18) {
      assert.equal(diagnostics.albumQueryCount, 3)
      assert.ok(diagnostics.stageQueryCounts['manual-alias'] > 0, 'reserve budget for aliases')
      assert.ok(diagnostics.stageQueryCounts['second-pass'] > 0, 'reserve budget for version-free retrieval')
    }
  }
})

test('metadata improvement on an existing ID is new evidence, not stagnation', async () => {
  const diagnostics = {}; let count = 0
  const match = await findTrackMatch({ ...source, tns: ['Other title', 'Third title'] }, async () => {
    count++
    return [track('same-id', count < 3 ? { name: 'Unknown', album: { name: `Details ${count}` } } : {})]
  }, diagnostics)
  assert.equal(match.candidate.id, 'same-id')
  assert.equal(count, 3)
  assert.deepEqual(diagnostics.stoppedStages, [])
})

test('real album adapter honors the shared budget and returns a completed page before the cap', async () => {
  let now = Date.now(), requests = 0, remaining = 2
  const state = { settings: {}, spotify: { refreshToken: 'test', accessToken: 'test', expiresAt: now + 86400000 }, sync: { checkpoint: {} } }
  const store = { state, async update(fn) { fn(state) } }
  const album = { id: 'a'.repeat(22), name: source.al.name, artists: source.ar }
  const client = new SpotifyClient(store, async url => {
    requests++
    return String(url).includes('/search?') ? Response.json({ albums: { items: [album] } }) :
      Response.json({ next: 'more', items: [track()] })
  }, { now: () => now, sleep: async ms => { now += ms } })
  const items = await client.findAlbumTracks(source, { takeQuery: () => remaining-- > 0 })
  assert.equal(requests, 2)
  assert.equal(items.length, 1)
  assert.equal((await client.findAlbumTracks(source, { takeQuery: () => false })).length, 0)
  assert.equal(requests, 2)
})

test('429 is propagated once, never converted into a search-budget miss', async () => {
  let calls = 0
  const diagnostics = {}
  await assert.rejects(findTrackMatch(source, async () => {
    calls++; throw Object.assign(Error('cooldown'), { status: 429 })
  }, diagnostics, { allowAlternateVersions: true }), { status: 429 })
  assert.equal(calls, 1)
  assert.equal(diagnostics.reason, undefined)
})
