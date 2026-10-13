import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, knownTrackIds, songTitles,
  songSearchStages, albumSearchQueries, selectSourceAlbums } from '../src/matcher.js'

const song = (id, name, artists, album, dt) => ({ id, name, ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })),
  album: { name: album }, duration_ms, is_playable: true, uri: `spotify:track:${id}` })
// First three pairs are saved candidate metadata. Last three are public catalog
// pointers with approximate page durations: simulations, not live availability.
const pairs = [
  [song(3421391237, '桜海岸（樱花海岸）', ['小林未郁', '琥珀琴师Louis'], '桜海岸（樱花海岸）', 225818),
    track('4YoGxyrCTHz3eczJ6mg3Ll', '桜海岸 (樱花海岸)', ['Mika Kobayashi', '琥珀琴师Louis'], '桜海岸 (樱花海岸)', 225818)],
  [song(28302837, 'minamo', ['ゆかな'], 'TVアニメ「アマガミSS」ENDING THEME COLLECTION', 338346),
    track('2ZnJ2Pbw1abURygSrp3dak', 'Minamo', ['七咲逢(CV:ゆかな)'], 'TV Anime "Amagami SS" (Ending Theme Collection)', 338346)],
  [song(287241, '没关系', ['容祖儿'], '小小', 220270),
    track('1oxLzmA6AxqYeY1fPOBKbo', '沒關係', ['Joey Yung'], '一百個我 國語新曲+精選', 218810)],
  [song(28151022, '鳥の詩', ['Lia'], 'AIR ORIGINAL SOUNDTRACK', 368000),
    track('2JacUWw1kxN2lunFlCLrPe', 'Tori no Uta', ['Lia', 'VISUAL ARTS / Key'], 'AIR ORIGINAL SOUNDTRACK', 368000)],
  [song(497399, 'ここにいるよ', ['SoulJa', '青山テルマ'], 'ここにいるよ feat.青山テルマ', 331965),
    track('253IuSdk8aMyQR2j8ncGsY', 'ここにいるよ', ['SoulJa', 'Thelma Aoyama'], '平成ヒット～オールスターズ～', 329000)],
  [song(1355979244, 'ハーフムーン・セレナーデ', ['河合奈保子'], '私が好きな河合奈保子', 332626),
    track('3eeXfKpoIJBKJTwGb33Mt3', 'ハーフムーン・セレナーデ', ['Naoko Kawai'], 'ゴールデン☆アイドル 河合奈保子', 332000)],
]

test('October 13 saved false negatives pass without weakening artist or version checks', () => {
  for (const [s, t] of pairs) {
    assert.equal(pickBestMatch(s, [t])?.candidate.id, t.id, s.name)
    assert.equal(pickBestMatch(s, [{ ...t, is_playable: false }]), null)
    const wrong = { ...t, artists: [{ name: 'Unrelated Performer' }] }
    assert.equal(pickBestMatch(s, [wrong]), null)
    assert.equal(pickAlternateVersion(s, [wrong]), null)
    assert.equal(pickAlternateVersion(s, [{ ...t, name: t.name + ' - Instrumental' }]), null)
    assert.deepEqual(knownTrackIds({ ...s, name: 'Different Song' }), [])
    assert.deepEqual(knownTrackIds({ ...s, ar: [{ name: 'Other' }] }), [])
  }
  const [s, t] = pairs[0]
  assert.equal(pickBestMatch(s, [{ ...t, artists: [{ name: 'Other' }, t.artists[1]] }]), null)
})

test('translated album corroborates full CV cast, not another role, partial roster or unknown album', () => {
  const [s, t] = pairs[1]
  assert.equal(pickBestMatch(s, [t])?.identityEvidence, 'complete-voice-cast')
  for (const changes of [
    { album: { name: 'Another Album' } }, { duration_ms: t.duration_ms + 3000 },
    { artists: [{ name: '七咲逢(CV:別人)' }] },
    { artists: [...t.artists, { name: 'Other Role(CV:Other)' }] },
  ]) assert.equal(pickBestMatch(s, [{ ...t, ...changes }]), null)
  assert.equal(pickBestMatch({ ...s, ar: [{ name: 'Other Role(CV:ゆかな)' }] }, [t]), null)
  // Album names are reusable evidence for other songs, not a per-track bypass.
  const next = { ...s, id: 0, name: 'Another Song' }
  assert.ok(pickBestMatch(next, [{ ...t, id: 'another', name: next.name }]))
  assert.ok(albumSearchQueries(s).some(q => q.includes('Amagami SS')))
  assert.equal(selectSourceAlbums(s, [{ id: t.id, name: t.album.name, artists: t.artists }]).length, 1)
})

test('artist aliases work bidirectionally and get an early query slot within the existing budget', () => {
  for (const [a, b] of [['小林未郁', 'Mika Kobayashi'], ['容祖儿', 'Joey Yung'], ['河合奈保子', 'Naoko Kawai']]) {
    for (const [left, right] of [[a, b], [b, a]]) {
      const s = song(0, 'A New Song', [left], 'Album', 200000)
      assert.ok(pickBestMatch(s, [track('t', s.name, [right], 'Album', 200000)]))
      assert.ok(songSearchStages(s)[0].queries.slice(0, 3).some(q => q.includes(right)))
    }
  }
})

test('Tori no Uta translation is limited to the reviewed source, title and artist', () => {
  const [s, t] = pairs[3]
  assert.ok(songTitles(s).includes(t.name))
  for (const changes of [{ id: 0 }, { name: 'Other' }, { ar: [{ name: 'Roselia' }] }]) {
    assert.ok(!songTitles({ ...s, ...changes }).includes(t.name))
    assert.deepEqual(knownTrackIds({ ...s, ...changes }), [])
  }
})

test('fresh playable pointers use one request including strict same-artist reissues within 8s', async () => {
  for (const [s, t] of pairs) {
    const d = {}
    const result = await findTrackMatch(s, async () => assert.fail('unnecessary search'), d, {
      findKnownTracks: async (_song, { ids, takeQuery }) => {
        assert.deepEqual(ids, [t.id]); assert.ok(takeQuery()); return [t]
      },
    })
    assert.equal(result?.candidate.id, t.id)
    assert.equal(d.catalogQueryCount, 1)
    assert.equal(d.queryCount, 0)
  }
})

test('unavailable pointers cannot match or erase an availability denial; budgets remain bounded', async () => {
  const [s, t] = pairs[0]
  const d = {}
  const hit = await findTrackMatch(s, async () => [{ ...t, is_playable: undefined }], d, {
    findKnownTracks: async (_song, { takeQuery }) => { assert.ok(takeQuery()); return [{ ...t, is_playable: false }] },
    maxQueries: 4,
  })
  assert.equal(hit, null)
  assert.ok(d.catalogQueryCount <= 4)
  assert.equal(d.knownTrackStatus, 'unplayable')
})

test('provider rate limits propagate immediately with no fallback search', async () => {
  const [s] = pairs[0]
  const error = Object.assign(new Error('cooldown'), { status: 429, retryAfterSeconds: 3600 })
  await assert.rejects(findTrackMatch(s, async () => assert.fail('must not continue'), {}, {
    findKnownTracks: async () => { throw error },
  }), e => e === error)
})

test('known-pointer reissue shortcut does not expand ordinary search or uncertain-duration early exits', async () => {
  const [s, t] = pairs[4]
  let searches = 0
  const result = await findTrackMatch(s, async () => { searches++; return [t] }, {}, { maxQueries: 3 })
  assert.ok(result)
  assert.ok(searches > 1, 'ordinary search keeps its tighter early-exit threshold')
  searches = 0
  await findTrackMatch(s, async () => { searches++; return [] }, {}, {
    maxQueries: 3,
    findKnownTracks: async (_song, { takeQuery }) => {
      takeQuery(); return [{ ...t, duration_ms: s.dt + 8001 }]
    },
  })
  assert.ok(searches > 0, 'larger duration differences still require review')
})
