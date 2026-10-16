import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, knownTrackIds, songTitles,
  searchableArtists, titleVariants, sourceSongView, MAX_SONG_CATALOG_QUERIES } from '../src/matcher.js'
import { SyncService, dateInTimezone } from '../src/sync.js'

const song = (id, name, artists, album, dt) => ({ id, name, ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })),
  album: { name: album }, duration_ms, uri: `spotify:track:${id}`, is_playable: true })
// First five pairs reproduce saved candidates. The last two are public catalog
// metadata (page-rounded durations), NOT a live account-availability assertion.
const pairs = [
  [song(2676697681, 'The Rose of Versailles', ['澤野弘之', '沢城みゆき', '平野綾', '豊永利行', '加藤和樹'], 'Song Collection from The Rose of Versailles', 279424),
    track('6vcio2JFAOv6VVWiuuPyV7', 'The Rose of Versailles', ['Sawano Hiroyuki', 'オスカル(CV.沢城みゆき)', 'マリー・アントワネット(CV.平野 綾)', 'アンドレ(CV.豊永利行)', 'フェルゼン(CV.加藤和樹)'], 'Song Collection from The Rose of Versailles', 279424)],
  [song(2053710705, '忘れてやらない-Anime Ver.-', ['結束バンド'], '結束バンド EXTRA MUSIC 3', 152026),
    track('5ISHFvPLUqKz2JfDRtwnb2', '忘れてやらない', ['結束バンド'], '結束バンド', 223360)],
  [song(26921526, 'It Never Rains In California', ['Albert Hammond'], 'Singers & Songwriters', 229000),
    track('1K24PVzIzAKBzRhmVKRleL', 'It Never Rains in Southern California', ['Albert Hammond'], "Radio Hits Of the '70s'", 229000)],
  [song(2737471087, 'ドゥーマー', ['東京真中'], 'ドゥーマー', 148625),
    track('3J8h8AUh100VIaFbSjCxB4', 'Doomer', ['東京真中'], 'Doomer', 148625)],
  [song(1483488615, 'Komm, süsser Tod ／甘き死よ、来たれ (M-10 Director’s Edit. Version)', ['arianne schreiber'], 'EVANGELION FINALLY', 466481),
    track('0DI3WNmIyfi2GZLQwhYDQC', "KOMM, SUSSER TOD - M-10 Director's Edit Version", ['Arianne'], 'Evangelion Finally', 466481)],
  [song(2085407634, '素直にI love youを', ['坂巻有紗'], '素直にI love youを', 300000),
    track('2ZZPDPEpUnOZtZOTqaSSO0', '素直にI love youを', ['坂巻有紗'], '素直にI love youを', 300000)],
  [song(2655081593, '夜明けを乞う。 (feat. むト)', ['酔シグレ', 'むﾄ'], '夜明けを乞う。 (feat. むト)', 263414),
    track('00IHLQp6456jp4hzOtGIkR', 'Begging for dawn (feat. Muto)', ['Yoishigure', 'Muto'], 'Begging for dawn (feat. Muto)', 263000)],
]

test('October 16 seven reviewed pairs recover, with the full song marked as an alternate to the anime edit', () => {
  for (const [i, [s, t]] of pairs.entries()) {
    const strict = pickBestMatch(s, [t])
    if (i === 1) {
      assert.equal(strict, null, 'a full recording must not masquerade as the anime edit')
      assert.equal(pickAlternateVersion(s, [t])?.candidate.id, t.id)
      assert.equal(pickAlternateVersion(s, [t])?.alternateVersion, true)
    } else assert.equal(strict?.candidate.id, t.id, s.name)
    const wrong = { ...t, artists: [{ name: 'Unrelated Performer' }] }
    assert.equal(pickBestMatch(s, [wrong]), null, s.name)
    assert.equal(pickAlternateVersion(s, [wrong]), null, s.name)
    assert.equal(pickAlternateVersion(s, [{ ...t, name: t.name + ' - Instrumental' }]), null)
    assert.equal(pickBestMatch(s, [{ ...t, is_playable: false }]), null)
    assert.equal(pickAlternateVersion(s, [{ ...t, is_playable: false }]), null)
    for (const changes of [{ id: 0 }, { name: 'Another Song' }, { ar: [{ name: 'Unrelated' }] }]) {
      assert.deepEqual(knownTrackIds({ ...s, ...changes }), [])
    }
  }
})

test('mixed composer and CV-dot/colon credits need the entire one-to-one cast and tight recording evidence', () => {
  const [s, t] = pairs[0]
  assert.equal(pickBestMatch(s, [t])?.identityEvidence, 'complete-voice-cast')
  assert.ok(pickBestMatch(s, [{ ...t, artists: t.artists.map(a => ({ name: a.name.replace('CV.', 'CV：') })) }]))
  for (const changes of [
    { artists: t.artists.slice(0, -1) },
    { artists: [...t.artists, { name: 'Other(CV:Other Actor)' }] },
    { artists: t.artists.map((a, i) => i === 4 ? { name: 'Other(CV:Wrong Actor)' } : a) },
    { artists: [...t.artists.slice(0, 4), t.artists[1]] },
    { artists: [t.artists[0]] },
    { album: { name: 'Other Album' } },
    { duration_ms: s.dt + 2501 },
  ]) {
    const wrong = { ...t, ...changes }
    assert.equal(pickBestMatch(s, [wrong]), null)
    assert.equal(pickAlternateVersion(s, [wrong]), null, 'composer match cannot override an unproven cast')
  }
  const newSong = { ...s, id: 0, name: 'Another Ensemble Song' }
  assert.ok(pickBestMatch(newSong, [{ ...t, name: newSong.name }]), 'not a source-ID-only CV exception')
  const role = song(0, 'Role Song', ['Role A(CV.Actor A)'], 'Album', 200000)
  assert.equal(pickBestMatch(role, [track('role', role.name, ['Role B(CV:Actor A)'], 'Album', role.dt)]), null)
  assert.equal(pickAlternateVersion(role, [track('role', role.name, ['Role B(CV:Actor A)'], 'Album', role.dt)]), null)
  assert.ok(pickBestMatch(role, [track('role', role.name, ['Role A(CV:Actor A)'], 'Album', role.dt)]))
})

test('anime edition stripping is bounded, alternate-only, and retains vocal/language guards', () => {
  for (const label of ['-Anime Ver.-', ' - Anime Version', ' (Anime Ver.)']) {
    const s = song(0, 'New Song' + label, ['Artist'], 'Album', 90000)
    const t = track('full', 'New Song', ['Artist'], 'Album', 210000)
    assert.equal(pickBestMatch(s, [t]), null)
    assert.ok(pickAlternateVersion(s, [t]))
    assert.equal(pickAlternateVersion(s, [{ ...t, name: 'New Song (English Ver.)' }]), null)
    assert.equal(pickAlternateVersion(s, [{ ...t, name: 'New Song - Instrumental' }]), null)
  }
  for (const title of ['Anime Song', 'New Song - Anime Memories', 'New Song Anime Ver.', 'New Song - Another Anime Version']) {
    const s = song(0, title, ['Artist'], 'Album', 200000)
    assert.equal(pickAlternateVersion(s, [track('bad', 'New Song', ['Artist'], 'Album', 200000)]), null)
  }
})

test('cross-script slash titles are reusable without splitting artist identities or same-script subtitles', () => {
  assert.ok(titleVariants('Komm, süsser Tod ／甘き死よ、来たれ').includes('Komm, süsser Tod'))
  assert.ok(titleVariants('甘き死よ、来たれ / Komm, süsser Tod').includes('Komm, süsser Tod'))
  for (const value of ['AC/DC', 'Song / Other Song', '歌 / 副題', '歌 / English Version']) {
    assert.deepEqual(titleVariants(value), [value])
  }
  assert.deepEqual(searchableArtists(song(0, 'Song', ['音楽 / Music'], '', 0), { identity: true }), ['音楽 / Music'])
  const s = song(0, '星のうた / Star Song', ['Singer'], 'Album', 200000)
  assert.ok(pickBestMatch(s, [track('t', 'Star Song', ['Singer'], 'Album', 200000)]))
})

test('director edition punctuation normalizes without silently accepting a different edit number', () => {
  const s = song(0, "Komm, süsser Tod (M-10 Director’s Edit. Version)", ['Arianne'], 'Album', 466481)
  const t = track('t', "KOMM, SUSSER TOD - M-10 Director's Edit Version", ['Arianne'], 'Album', 466481)
  assert.ok(pickBestMatch(s, [t]))
  for (const name of [t.name.replace('M-10', 'M-9'), 'KOMM, SUSSER TOD']) {
    assert.equal(pickBestMatch(s, [{ ...t, name }]), null)
    assert.ok(pickAlternateVersion(s, [{ ...t, name }]), 'a proven same-artist different edit is explicitly an alternate')
  }
})

test('reviewed title translations and mononym credits remain source/title/artist scoped', () => {
  for (const index of [2, 3, 4, 6]) {
    const [s, t] = pairs[index]
    assert.ok(songTitles(s).includes(t.name))
    for (const changes of [{ id: 0 }, { name: 'Another Song' }, { ar: [{ name: 'Someone Else' }] }]) {
      assert.ok(!songTitles({ ...s, ...changes }).includes(t.name))
    }
  }
  const [s] = pairs[4]
  assert.ok(searchableArtists(s).includes('Arianne'))
  assert.ok(!searchableArtists({ ...s, id: 0 }).includes('Arianne'))
  assert.ok(!searchableArtists({ ...s, name: 'Another Song' }).includes('Arianne'))
  const [duet, recording] = pairs[6]
  for (const artists of [[recording.artists[0]], [recording.artists[0], { name: 'Other Guest' }]]) {
    assert.equal(pickBestMatch(duet, [{ ...recording, artists }]), null)
    assert.equal(pickAlternateVersion(duet, [{ ...recording, artists }]), null)
  }
})

test('all seven freshly playable pointers need only one query; full recording remains labeled alternate', async () => {
  for (const [index, [s, t]] of pairs.entries()) {
    const d = {}
    const result = await findTrackMatch(s, async () => assert.fail('unnecessary search'), d, {
      allowAlternateVersions: true,
      findKnownTracks: async (_source, { ids, takeQuery }) => {
        assert.deepEqual(ids, [t.id]); assert.ok(takeQuery()); return [t]
      },
    })
    assert.equal(result?.candidate.id, t.id, s.name)
    assert.equal(Boolean(result.alternateVersion), index === 1)
    assert.equal(d.catalogQueryCount, 1)
    assert.equal(d.queryCount, 0)
  }
})

test('unknown/unplayable pointers cannot use the alternate shortcut or erase a denial, and all queries share the budget', async () => {
  const [s, t] = pairs[1]
  for (const is_playable of [false, undefined]) {
    let searches = 0
    const d = {}
    const result = await findTrackMatch(s, async () => { searches++; return [] }, d, {
      allowAlternateVersions: true, maxQueries: 3,
      findKnownTracks: async (_source, { takeQuery }) => {
        takeQuery(); return [{ ...t, is_playable, catalogAvailability: is_playable === undefined ? 'unknown' : 'unplayable' }]
      },
    })
    assert.ok(searches > 0, 'uncertain availability must not short-circuit verification')
    if (is_playable === false) assert.equal(result, null)
    assert.ok(d.catalogQueryCount <= 3)
    assert.ok(d.catalogQueryCount <= MAX_SONG_CATALOG_QUERIES)
  }
  const d = {}
  assert.equal(await findTrackMatch(s, async () => [{ ...t, is_playable: undefined }], d, {
    allowAlternateVersions: true, maxQueries: 3,
    findKnownTracks: async (_s, { takeQuery }) => { takeQuery(); return [{ ...t, is_playable: false }] },
  }), null)
  assert.ok(d.catalogQueryCount <= 3)
})

test('429 aborts the targeted repair path immediately, without any fallback query', async () => {
  const error = Object.assign(new Error('rate limit'), { status: 429, retryAfterSeconds: 3600 })
  await assert.rejects(findTrackMatch(pairs[0][0], async () => assert.fail('no fallback'), {}, {
    allowAlternateVersions: true, findKnownTracks: async () => { throw error },
  }), e => e === error)
})

test('targeted seven-song repair preserves all twenty confirmed URIs, three deferred misses, order and custom cover', async () => {
  const confirmed = Array.from({ length: 20 }, (_, i) => song(100 + i, `Confirmed ${i}`, ['Singer'], 'Album', 200000))
  const deferred = Array.from({ length: 3 }, (_, i) => song(200 + i, `Deferred ${i}`, ['Singer'], 'Album', 200000))
  const songs = [...confirmed.slice(0, 5), pairs[0][0], ...confirmed.slice(5, 12),
    ...pairs.slice(1, 4).map(([s]) => s), ...deferred, ...confirmed.slice(12), ...pairs.slice(4).map(([s]) => s)]
  const previousMatches = confirmed.map(s => ({ source: sourceSongView(s), spotify: { id: `old${s.id}`, uri: `spotify:track:old${s.id}` } }))
  const oldMisses = [...deferred, ...pairs.map(([s]) => s)].map(s => ({ ...sourceSongView(s), diagnostics: { reason: 'saved-miss' } }))
  const state = { settings: { timezone: 'Asia/Shanghai', neteaseCookie: 'MUSIC_U=test' }, spotify: { refreshToken: 'test' },
    sync: { playlistId: 'existing', history: [], lastSuccessfulRun: {
      date: dateInTimezone('Asia/Shanghai'), playlistId: 'existing', matches: previousMatches, unmatched: oldMisses,
    } } }
  const fetched = []; let written
  const spotify = {
    async findKnownTracks(source, { ids, takeQuery }) {
      assert.ok(takeQuery()); fetched.push(String(source.id))
      const pair = pairs.find(([s]) => s.id === source.id)
      assert.ok(pair, 'must never recheck confirmed tracks or deferred misses')
      assert.deepEqual(ids, [pair[1].id]); return [pair[1]]
    },
    async searchTracks() { assert.fail('all seven reviewed pointers should verify without searches') },
    async replacePlaylist(id, uris) { assert.equal(id, 'existing'); written = uris },
    async updatePlaylist(id, details) { assert.equal(id, 'existing'); assert.equal(details.name, 'NetEase Daily') },
    async uploadPlaylistCover() { assert.fail('preserve custom cover') },
    async createPlaylist() { assert.fail('preserve playlist') },
  }
  const store = { state, async update(fn) { await fn(state) } }
  const result = await new SyncService(store, spotify, async () => songs).run({
    retryUnmatched: true, retrySourceIds: pairs.map(([s]) => String(s.id)), requireExistingPlaylist: true,
  })
  assert.deepEqual(fetched.sort(), pairs.map(([s]) => String(s.id)).sort())
  assert.equal(result.matchedCount, 27)
  assert.equal(result.unmatchedCount, 3)
  assert.deepEqual(result.unmatched, oldMisses.slice(0, 3))
  assert.equal(result.matches.filter(m => m.searchStage === 'same-day-confirmed').length, 20)
  for (const old of previousMatches) assert.deepEqual(result.matches.find(m => m.source.id === old.source.id)?.spotify, old.spotify)
  const ids = new Map([...previousMatches.map(m => [String(m.source.id), m.spotify.uri]), ...pairs.map(([s, t]) => [String(s.id), t.uri])])
  assert.deepEqual(written, songs.filter(s => ids.has(String(s.id))).map(s => ids.get(String(s.id))))
  assert.equal(state.sync.checkpoint, undefined)
})
