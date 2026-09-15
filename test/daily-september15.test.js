import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songSearchStages, knownTrackIds } from '../src/matcher.js'

const song = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const track = (id, name, artist, album, duration_ms) => ({ id, uri: `spotify:track:${id}`, name,
  artists: (Array.isArray(artist) ? artist : [artist]).map(name => ({ name })), album: { name: album }, duration_ms })

// Safe metadata from Sept 15's saved candidate diagnostics; no live API calls.
const ojos = song(2682113703, 'Ojos Tristes', 'Selena Gomez', 'I Said I Love You First', 201920)
ojos.ar.push({ name: 'Benny Blanco' })
const ojosHit = track('1DFmBjoeQN9DpOVTEewyx0', 'Ojos Tristes (with The Marías)',
  ['Selena Gomez', 'benny blanco', 'The Marías'], ojos.al.name, ojos.dt)
const cha = song(567817, 'CHA-CHA-CHA', '石井明美', 'ゴールデン☆ベスト 石井明美セレクション', 219000)
const chaHit = track('4c8iGaGVnW37QrYU2S0VRe', cha.name, 'Akemi Ishii', cha.al.name, 217706)
const bye = song(460628076, 'バイバイ。', '相川七瀬', 'バイバイ。', 277213)
const byeHit = track('6BbN9tHL0ltHOX7HXncESn', 'ﾊﾞｲﾊﾞｲ｡', 'Nanase Aikawa', "Rock 'N' Roll Journey -30th Anniversary Best-", 277373)

test('three saved-pool false negatives now need one search each, not 18/17/18', async () => {
  const collaboration = track('collab', cha.name, ['Miki Asakura', 'つのだ☆ひろ', '石井明美'], 'Other Album', 220800)
  const reissue = track('reissue', cha.name, 'Akemi Ishii', 'Mona Lisa', 218093)
  for (const [source, pool, expected] of [[ojos, [ojosHit], ojosHit], [cha, [collaboration, reissue, chaHit], chaHit], [bye, [byeHit], byeHit]]) {
    let requests = 0
    const match = await findTrackMatch(source, async () => { requests++; return pool }, {}, { allowAlternateVersions: true })
    assert.equal(match?.candidate.id, expected.id)
    assert.equal(requests, 1)
    assert.equal(match.searchDiagnostics.catalogQueryCount, 1)
  }
})

test('with credit cleanup requires a structured collaborator and preserves ordinary subtitles', () => {
  assert.equal(pickBestMatch(ojos, [{ ...ojosHit, artists: ojosHit.artists.slice(0, 2) }]), null)
  assert.equal(pickAlternateVersion(ojos, [{ ...ojosHit, artists: ojosHit.artists.slice(0, 2) }]), null)
  assert.equal(pickBestMatch(ojos, [{ ...ojosHit, name: 'Ojos Tristes (Another Story)' }]), null)
  assert.equal(pickBestMatch(ojos, [{ ...ojosHit, is_playable: false }]), null)
})

test('a source artist appearing only as a guest cannot identify a solo recording', () => {
  const collaboration = track('wrong', cha.name, ['Miki Asakura', 'つのだ☆ひろ', '石井明美'], cha.al.name, cha.dt)
  assert.equal(pickBestMatch(cha, [collaboration]), null)
  assert.equal(pickAlternateVersion(cha, [collaboration]), null)
  assert.equal(pickBestMatch({ ...cha, ar: [...cha.ar, { name: 'Shared Guest' }] },
    [track('wrong2', cha.name, ['Other Singer', 'Shared Guest'], cha.al.name, cha.dt)]), null)
  assert.equal(pickBestMatch(bye, [{ ...byeHit, artists: [{ name: 'Other Singer' }] }]), null)
})

test('same-album original wins close same-primary reissues but album cannot defeat much closer duration', () => {
  const other = track('reissue', cha.name, 'Akemi Ishii', 'Mona Lisa', 218093)
  assert.equal(pickBestMatch(cha, [other, chaHit])?.candidate.id, chaHit.id)
  // Do not weaken existing duration disambiguation or trust different artists.
  assert.equal(pickBestMatch(cha, [{ ...chaHit, artists: [{ name: 'Other' }] }]), null)
})

test('scoped translated titles recover existing album candidates, not unrelated songs', async () => {
  const remembrance = song(22842411, '회상', 'Leessang', 'AsuRaBalBalTa', 287000)
  remembrance.ar.push({ name: '白智英' })
  const hit = track('memory', 'remembrance (feat. Baek Z Young)', ['Leessang', 'Baek Z Young'], remembrance.al.name, 287000)
  assert.ok(await findTrackMatch(remembrance, async () => [hit], {}, { allowAlternateVersions: true }))
  assert.equal(pickBestMatch({ ...remembrance, id: 999 }, [hit]), null)
  assert.equal(pickBestMatch({ ...remembrance, ar: [{ name: 'Other' }] }, [hit]), null)
  const rui = song(285546, '讨厌', '芮恩', '芮恩 Rui∑n', 257840)
  const target = track('rui', "討厭 (Can't Stand It)", 'Rui En 芮恩', '芮恩 Rui En vol 1', 257840)
  assert.ok(pickBestMatch(rui, [target]))
  assert.ok(songSearchStages(rui).find(s => s.manual).queries.some(q => q.includes("Can't Stand It")))
})

test('clean title queries precede remaster and sale-label noise without changing song identity', () => {
  const remaster = song(22773649, '最愛(Remaster)', '中島みゆき', '御色なおし(Remaster)', 259866)
  assert.equal(songSearchStages(remaster)[0].queries[0], 'track:"最愛" artist:"中島みゆき"')
  const decorated = song(494064179, '柴 鱼 の c a l l i n g【已售】', '幸子小姐拜托了', 'Album', 151823)
  assert.equal(songSearchStages(decorated)[0].queries[0], 'track:"柴鱼の calling" artist:"幸子小姐拜托了"')
  assert.equal(decorated.name, '柴 鱼 の c a l l i n g【已售】')
  assert.equal(pickBestMatch(remaster, [track('wrong', '最愛', 'Vivian Chow', 'Album', 265800)]), null)
  const ooh = song(1335835528, 'Ooh Baby', 'Craig Ruhnke', 'True Love', 217979)
  assert.equal(pickBestMatch(ooh, [track('wrong', 'Ooh Baby', 'Ciara', 'Goodies', 217026)]), null)
})

test('artwork/popularity churn and irrelevant new IDs do not prolong the metadata stage', async () => {
  const source = { ...ojos, tns: ['Other Title', 'Third Title'] }
  const diagnostics = {}; let calls = 0
  const result = await findTrackMatch(source, async query => {
    calls++
    if (query === 'track:"Ojos Tristes"') return [ojosHit]
    return [track(String(calls), 'Nothing Related', 'Other', 'Album', 100000)]
  }, diagnostics)
  assert.ok(result)
  assert.equal(diagnostics.stageQueryCounts.metadata, 2)
  assert.ok(diagnostics.queryTrace.slice(0, 2).every(q => !q.newEvidence))
  const d = {}; let count = 0
  await findTrackMatch({ ...ojos, tns: ['A', 'B'] }, async () => {
    count++; return [{ ...track('constant', 'Ojos Tristes', 'Wrong Singer', 'Other', 201920), popularity: count, album: { name: 'Other', images: [{ url: String(count) }] } }]
  }, d)
  assert.equal(d.queryTrace[1].newEvidence, false)
})

test('Dear public ID is only a guarded retrieval hint, not a forced match', () => {
  const dear = song(41632971, 'Dear', 'lecca', 'BEST POSITIVE', 264080)
  assert.deepEqual(knownTrackIds(dear), ['6UdNAO674yXHaZroB8PkS7'])
  assert.deepEqual(knownTrackIds({ ...dear, name: 'Something Else' }), [])
  assert.deepEqual(knownTrackIds({ ...dear, ar: [{ name: 'Other Singer' }] }), [])
})
