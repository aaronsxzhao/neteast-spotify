import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songSearchStages, albumSearchQueries, selectSourceAlbums } from '../src/matcher.js'

const song = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const track = (name, artist, album, duration_ms, id = 'candidate') => ({ id, name, artists: [{ name: artist }], album: { name: album }, duration_ms, is_playable: true })

// Saved public catalog metadata from Oct 8–10. Offline replay, NOT a claim
// that these recordings are currently playable in every Spotify market.
const cases = [
  [song(1300423074, '可一可再', '陈奕迅', 'L.O.V.E.', 287573), track('可一可再', 'Eason Chan', 'L.O.V.E.', 287573)],
  [song(22645581, '意識', '椎名林檎', '平成風俗', 160973), track('意識', 'Sheena Ringo', '平成風俗', 160973)],
  [song(2654774912, '蓝色雨', '温岚', '', 294707), track('藍色雨', 'Landy Wen', '愛回溫新歌+精選', 294706)],
  [song(410654143, 'ラブ・ストーリーは突然に', '小田和正', 'あの日 あの時', 297703), track('ラブ・ストーリーは突然に', 'Kazumasa Oda', 'Anohi Anotoki', 297653)],
  [song(659350, '駅', '竹内まりや', '駅 / After Years', 300613), track('駅', 'Mariya Takeuchi', 'REQUEST (30th Anniversary Edition)', 300613)],
  [song(3327545535, '言伝', 'Bialystocks', '言伝', 275925), track('Kotozute', 'Bialystocks', 'Kotozute', 275925)],
  [song(762499, '波よせて', 'クラムボン', 'LOVER ALBUM リマスター', 310386), track('波よせて', 'clammbon', 'clammbon - columbia best', 309000)],
]
for (const i of [0, 1]) {
  const guest = i === 0 ? 'eason and the duo band' : '斎藤ネコ'
  cases[i][0].ar.push({ name: guest })
  cases[i][1].artists.push({ name: guest })
}

test('October saved candidates resolve with reviewed primary identities and scoped title', async () => {
  for (const [s, c] of cases) {
    assert.equal(pickBestMatch(s, [c])?.candidate.id, c.id, s.name)
    let calls = 0
    const result = await findTrackMatch(s, async () => { calls++; return [c] }, {}, { allowAlternateVersions: true })
    assert.equal(result?.candidate.id, c.id, s.name)
    assert.ok(calls <= (s.name === '言伝' ? 7 : 1), `${s.name}: ${calls}`)
    assert.equal(pickBestMatch(s, [{ ...c, is_playable: false }]), null)
    const wrong = { ...c, artists: [{ name: 'Other Singer' }, ...c.artists.slice(1)] }
    assert.equal(pickBestMatch(s, [wrong]), null, 'shared guest cannot prove the primary artist')
    assert.equal(pickAlternateVersion(s, [wrong]), null)
  }
})

test('reviewed identities reject similarly timed covers and preserve same-artist alternatives', () => {
  const [eki, original] = cases[4]
  const cover = { ...original, id: 'cover', artists: [{ name: 'Akina Nakamori' }], duration_ms: 300600 }
  assert.equal(pickBestMatch(eki, [cover, original])?.candidate.id, original.id)
  assert.equal(pickBestMatch(eki, [cover]), null)
  const s = song(2012146052, '真夜中のドア/Stay With Me', '松原みき', 'Paradise Beach', 309786)
  assert.equal(pickBestMatch(s, [track('真夜中のドア～Stay with me', 'EIKO', 'Dreamer', 308093)]), null)
  const live = track('波よせて - Live', 'clammbon', '3 peace (live at 百年蔵)', 427333)
  assert.equal(pickBestMatch(cases[6][0], [live]), null)
  assert.ok(pickAlternateVersion(cases[6][0], [live])?.alternateVersion)
  assert.equal(pickAlternateVersion(cases[6][0], [{ ...live, name: '波よせて (instrumental)' }]), null)
})

test('Kotozute translation requires source ID, title and artist; duration is not translation proof', async () => {
  const [s, c] = cases[5]
  for (const changed of [{ ...s, id: 1 }, { ...s, name: '別の歌' }, { ...s, ar: [{ name: 'Other Singer' }] }]) {
    assert.equal(pickBestMatch(changed, [c]), null)
    assert.equal(pickAlternateVersion(changed, [c]), null)
  }
  const d = {}
  assert.equal(await findTrackMatch({ ...s, id: 1 }, async () => [c], d), null)
  assert.ok(d.reviewReasons.includes('title-translation-unconfirmed'))
})

test('album translations are not crowded out by first-name glyph or subtitle variants', () => {
  const s = song(0, 'PLANET', 'ラムジ', '3ラムジ～collection', 243400)
  s.al.tns = ['3 Lambsey']
  assert.deepEqual(albumSearchQueries(s), ['album:"3ラムジ～collection"', 'album:"3 Lambsey"'])
  const album = { id: '1234567890123456789012', name: '3 Lambsey', artists: [{ name: 'Lambsey' }] }
  assert.deepEqual(selectSourceAlbums(s, [album]), [album])
  assert.equal(songSearchStages(s).find(stage => stage.name === 'album').queries[1], 'album:"3 Lambsey" artist:"ラムジ"')
})

test('new primary aliases get reserved early fallback slots before repeated query syntax', async () => {
  const s = song(812400, 'PLANET', 'ラムジ', '3ラムジ', 243400)
  s.al.tns = ['3 Lambsey']
  const stages = songSearchStages(s)
  assert.ok(!stages.filter(stage => !stage.manual).flatMap(stage => stage.queries).some(q => q.includes('artist:"Lambsey"')))
  assert.ok(stages.find(stage => stage.manual).queries.slice(0, 2).includes('track:"PLANET" artist:"Lambsey"'))
  const seen = [], d = {}
  const c = track('PLANET', 'Lambsey', '3 Lambsey', 243400)
  const result = await findTrackMatch(s, async query => {
    seen.push(query)
    return query === 'track:"PLANET" artist:"Lambsey"' ? [c] : []
  }, d, { allowAlternateVersions: true })
  assert.equal(result?.candidate.id, c.id)
  assert.equal(new Set(seen).size, seen.length)
  assert.ok(d.catalogQueryCount <= 18)
  for (const maxQueries of [0, 1, 4, 18]) {
    const stats = {}
    await findTrackMatch(s, async () => [], stats, { maxQueries, allowAlternateVersions: true })
    assert.ok(stats.catalogQueryCount <= maxQueries)
  }
})
