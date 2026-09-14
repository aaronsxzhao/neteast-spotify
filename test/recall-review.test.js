import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songSearchStages, knownTrackIds, albumSearchQueries } from '../src/matcher.js'
import { SpotifyClient } from '../src/spotify.js'

const song = (name = 'A Distinctive Song', artist = 'Singer') => ({ name, ar: [{ name: artist }], dt: 200000, al: { name: 'Album' } })
const track = (source, artist = source.ar[0].name) => ({ id: 'hit', uri: 'spotify:track:hit', name: source.name,
  artists: [{ name: artist }], duration_ms: source.dt, album: { name: source.al.name }, is_playable: true })

test('a band-name component cannot identify a solo artist, in either direction', () => {
  for (const [a, b] of [['mink', 'Cold Diamond & Mink'], ['Cold Diamond & Mink', 'mink'], ['BUN', 'KYOZO & BUN']]) {
    const source = song('Love is...', a)
    assert.equal(pickBestMatch(source, [track(source, b)]), null)
    assert.equal(pickAlternateVersion(source, [track(source, b)]), null)
  }
  const source = song('Love is...', 'mink')
  assert.equal(pickBestMatch(source, [{ ...track(source), artists: [{ name: 'Bobby Oroza' }, { name: 'Cold Diamond & Mink' }] }]), null)
})

test('complete combined and structured artist rosters still agree', () => {
  const source = song('A Distinctive Song', 'KYOZO & BUN')
  assert.ok(pickBestMatch(source, [{ ...track(source), artists: [{ name: 'KYOZO' }, { name: 'BUN' }] }]))
  assert.equal(pickBestMatch(source, [track(source, 'KYOZO')]), null)
})

test('game-theme short titles help retrieval without weakening identity scoring', async () => {
  const source = song('月の明り -ファイナルファンタジーIV 爱のテーマ-', '伊田恵美')
  const queries = [], diagnostics = {}
  const match = await findTrackMatch(source, async q => {
    queries.push(q)
    return q === 'track:"月の明り"' ? [track(source)] : []
  }, diagnostics)
  assert.equal(match?.candidate.id, 'hit')
  assert.ok(queries.includes('track:"月の明り"'))
  assert.equal(pickBestMatch(source, [{ ...track(source), name: '月の明り' }]), null,
    'a retrieval-only abbreviation must not prove the recording title')
  assert.ok(!songSearchStages(song('Escape - The Journey')).some(stage => stage.queries.includes('track:"Escape"')))
})

test('planned but skipped metadata queries remain eligible later; executed queries never repeat', async () => {
  const source = { ...song(), tns: ['Second Name', 'Third Name'] }
  const wanted = 'track:"Third Name" artist:"Singer"'
  const stages = songSearchStages(source)
  assert.ok(stages[0].queries.includes(wanted))
  assert.ok(stages.find(stage => stage.manual).queries.includes(wanted))
  const queries = [], diagnostics = {}
  const match = await findTrackMatch(source, async q => { queries.push(q); return q === wanted ? [track(source)] : [] }, diagnostics)
  assert.ok(match)
  assert.equal(new Set(queries).size, queries.length)
  assert.ok(diagnostics.stoppedStages.some(stage => stage.stage === 'metadata' && stage.reason === 'no-new-candidates'))
  assert.ok(queries.length <= 18)
})

test('unused phase slots can fund skipped useful queries, still under the same total cap', async () => {
  const source = song("Can't Smile without You", 'Peppi Kamadhatu')
  const queries = [], diagnostics = {}
  await findTrackMatch(source, async q => { queries.push(q); return [] }, diagnostics, { allowAlternateVersions: true })
  assert.ok(queries.includes('Can t Smile without You Peppi Kamadhatu'))
  assert.equal(new Set(queries).size, queries.length)
  assert.ok(diagnostics.stageQueryCounts['budget-recovery'] > 0)
  assert.ok(diagnostics.catalogQueryCount <= 18)
  assert.equal(diagnostics.queryTrace.length, queries.length)
})

test('reviewed artist spellings and genuine title translations appear before glyph permutations', () => {
  const source = song('濡れた髪のLonely', '池田聡')
  source.tns = ['湿发的Lonely']
  const queries = songSearchStages(source).find(stage => stage.manual).queries
  assert.equal(queries[0], 'track:"濡れた髪のLonely" artist:"Satoshi Ikeda"')
  const love = { ...song('ラブ・スコール', '大野雄二'), id: 468490434 }
  assert.match(songSearchStages(love).find(stage => stage.manual).queries[0], /LOVE SQUALL/)
  assert.deepEqual(albumSearchQueries({ ...song(), al: { name: 'Miroir―鏡の向こう側に―' } }),
    ['album:"Miroir―鏡の向こう側に―"', 'album:"Miroir"'])
})

const knownSource = { ...song('恋人たちの地平線', '菊池桃子'), id: 601640 }
function clientFixture(response) {
  let now = Date.now()
  const calls = []
  const state = { settings: {}, spotify: { accessToken: 'test', refreshToken: 'test', expiresAt: now + 86400000 }, sync: { checkpoint: {} } }
  const store = { state, async update(fn) { fn(state) } }
  return { calls, state, client: new SpotifyClient(store, async url => { calls.push(String(url)); return response() }, { now: () => now, sleep: async ms => { now += ms } }) }
}

test('known pointers require source identity, account availability and normal matching', async () => {
  assert.deepEqual(knownTrackIds({ ...knownSource, name: 'Other Song' }), [])
  assert.deepEqual(knownTrackIds({ ...knownSource, ar: [{ name: 'Other Singer' }] }), [])
  const f = clientFixture(() => Response.json({ ...track(knownSource, 'Momoko Kikuchi'), privatePayload: 'never retain' }))
  let searches = 0
  const diagnostics = {}
  const match = await findTrackMatch(knownSource, async () => { searches++; return [] }, diagnostics,
    { findKnownTracks: (source, budget) => f.client.findKnownTracks(source, budget) })
  assert.equal(match.searchStage, 'known-track')
  assert.equal(searches, 0)
  assert.equal(f.calls.length, 1)
  assert.equal(diagnostics.catalogQueryCount, 1)
  assert.equal(diagnostics.knownTrackQueryCount, 1)
  assert.equal(diagnostics.queryCount, 0)
  assert.doesNotMatch(JSON.stringify(f.state.sync.searchCache), /never retain/)
  await f.client.findKnownTracks(knownSource)
  assert.equal(f.calls.length, 1, 'successful ID lookup survives checkpoint replay')
})

test('unavailable or unknown-availability pointers are not accepted; playable reissues may recover', async () => {
  for (const availability of [false, undefined]) {
    const f = clientFixture(() => Response.json({ ...track(knownSource, 'Momoko Kikuchi'), is_playable: availability }))
    const diagnostics = {}
    const miss = await findTrackMatch(knownSource, async () => [], diagnostics,
      { findKnownTracks: (source, budget) => f.client.findKnownTracks(source, budget) })
    assert.equal(miss, null)
    assert.equal(diagnostics.knownTrackStatus, availability === false ? 'unplayable' : 'availability-unknown')
    assert.ok(diagnostics.reviewReasons.includes(availability === false ? 'known-recording-unplayable' : 'known-availability-unconfirmed'))
    assert.ok(diagnostics.catalogQueryCount <= 18)
    const recovered = await findTrackMatch(knownSource, async () => [{ ...track(knownSource, 'Momoko Kikuchi'), id: 'reissue' }], {},
      { findKnownTracks: (source, budget) => f.client.findKnownTracks(source, budget) })
    assert.equal(recovered.candidate.id, 'reissue')
  }
})

test('known lookup shares the zero budget, and a mismatched public pointer cannot be trusted', async () => {
  const f = clientFixture(() => Response.json(track(song('Unrelated', 'Other'))))
  const options = { findKnownTracks: (source, budget) => f.client.findKnownTracks(source, budget), maxQueries: 0 }
  assert.equal(await findTrackMatch(knownSource, async () => [], {}, options), null)
  assert.equal(f.calls.length, 0)
  assert.equal(await findTrackMatch(knownSource, async () => [], {}, { ...options, maxQueries: 18 }), null)
})

test('known lookup treats only 404 as missing, never swallows cooldown or authorization errors', async () => {
  for (const status of [401, 403, 429]) {
    const f = clientFixture(() => new Response('', { status, headers: { 'Retry-After': '900' } }))
    await assert.rejects(f.client.findKnownTracks(knownSource), status === 401 ? /Could not refresh Spotify login/ : { status })
    // 401 may refresh the token once; 429 must not retry.
    if (status === 429) {
      assert.equal(f.calls.length, 1)
      assert.ok(f.state.spotify.retryAfterUntil > Date.now())
    }
  }
  const f = clientFixture(() => new Response('', { status: 404 }))
  assert.deepEqual(await f.client.findKnownTracks(knownSource), [])
})

test('availability denial survives a less informative search response for the same ID', async () => {
  const f = clientFixture(() => Response.json({ ...track(knownSource, 'Momoko Kikuchi'), is_playable: false }))
  const result = await findTrackMatch(knownSource, async () => [{ ...track(knownSource, 'Momoko Kikuchi'), is_playable: undefined }], {},
    { findKnownTracks: (source, budget) => f.client.findKnownTracks(source, budget), allowAlternateVersions: true })
  assert.equal(result, null)
})

test('direct IDs, albums, search and transferred budget jointly stay below 18', async () => {
  const diagnostics = {}; let calls = 0
  const unrelated = () => ({ ...track(song('Unrelated', 'Other')), id: String(++calls) })
  const result = await findTrackMatch(knownSource, async () => [unrelated()], diagnostics, {
    allowAlternateVersions: true,
    findKnownTracks: async (_, { takeQuery }) => takeQuery() ? [unrelated()] : [],
    findAlbumTracks: async (_, { takeQuery }) => {
      const items = []
      for (let i = 0; i < 6 && takeQuery(); i++) items.push(unrelated())
      return items
    },
  })
  assert.equal(result, null)
  assert.ok(calls <= 18)
  assert.equal(diagnostics.catalogQueryCount, calls)
  assert.equal(calls, diagnostics.queryCount + diagnostics.albumQueryCount + diagnostics.knownTrackQueryCount)
})
