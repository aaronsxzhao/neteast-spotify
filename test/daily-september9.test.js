import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, songSearchStages, sourceSongView } from '../src/matcher.js'

const source = (name, artist, dt, extra = {}) => ({ name, ar: [{ name: artist }], dt, ...extra })
const target = (name, artist, duration_ms, extra = {}) => ({ id: 'correct', name, artists: [{ id: artist, name: artist }], duration_ms, ...extra })

test('mixed-script artist display matches its complete native-name component', () => {
  const song = source('돌고 돌아', '김수영', 271829, { tns: ['Round and Round'], al: { name: 'Round and Round' } })
  assert.ok(pickBestMatch(song, [target('Round and Round', '김수영 Kim Suyoung', 271829, { album: { name: 'Round and Round' } })], 0.68, { manual: false }))
  assert.equal(pickBestMatch(source('Some', 'Kim', 200000), [target('Some', '김수영 Kim Suyoung', 200000)]), null)
})

test('live album context and edition suffix recover BENI without accepting studio', async () => {
  const song = source('Kiss Kiss Kiss', 'BENI', 177500, { al: { name: 'MTV UNplugged' } })
  const live = target('Kiss Kiss Kiss - Live At Billboard Live Tokyo / 2011', 'BENI', 178000, { album: { name: 'MTV Unplugged (Live At Billboard Live Tokyo / 2011)' } })
  const studio = target('Kiss Kiss Kiss', 'BENI', 258413, { id: 'studio', album: { name: 'Bitter & Sweet' } })
  assert.equal(pickBestMatch(song, [studio, live])?.candidate.id, 'correct')
  assert.equal(pickBestMatch(song, [{ ...studio, duration_ms: 177500 }]), null)
  assert.equal(pickBestMatch({ ...song, al: { name: 'Studio' } }, [live]), null)
  assert.ok(songSearchStages(song).flatMap(s => s.queries).includes('Kiss Kiss Kiss MTV UNplugged'))
})

test('verified original artist defeats same-title cover ambiguity', () => {
  const song = source('恋におちて -Fall In love-', '小林明子', 301603)
  const original = target('恋におちて -Fall In love-', 'Akiko Kobayashi', 301546)
  const cover = target('恋におちて -Fall In love-', 'Ms.OOJA', 304000, { id: 'cover' })
  assert.equal(pickBestMatch(song, [cover, original])?.candidate.id, 'correct')
  assert.equal(pickBestMatch(song, [cover, original], 0.68, { manual: false }), null)
})

test('source-scoped Korean translation and compound target credits retain checks', () => {
  const song = source('사람냄새', '郑仁', 208000, { id: 28593407, ar: [{ name: '郑仁' }, { name: 'Gary' }] })
  const hit = target('Your scent', 'Jung In&Gary', 208000)
  assert.ok(pickBestMatch(song, [hit]))
  assert.equal(pickBestMatch({ ...song, id: 'another' }, [hit]), null)
  assert.equal(pickBestMatch(song, [{ ...hit, artists: [{ name: 'Unrelated Singer' }] }]), null)
  const rain = source('비 오는 날 듣기 좋은 노래 (Feat. Colde)', 'EPIK HIGH', 243785, { id: 1857311472 })
  assert.ok(pickBestMatch(rain, [target('Rain Song (Feat. Colde)', 'Epik High', 245000)]))
})

test('near-exact duration and closer album evidence disambiguate same-artist reissues', () => {
  const song = source('恋におちて -Fall In love-', '小林明子', 301603, { al: { name: '小林明子 ゴールデン☆ベスト' } })
  const original = target('恋におちて -Fall in love-', 'Akiko Kobayashi', 301546, { album: { name: 'GOLDEN☆BEST 小林明子 Single Collection～恋におちて～' } })
  const reissue = target(original.name, 'Akiko Kobayashi', 304705, { id: 'reissue', album: { name: '恋におちて－Fall in love－ / 夏の終わりに BESTタッグ' } })
  assert.equal(pickBestMatch(song, [reissue, original])?.candidate.id, 'correct')
  assert.equal(pickBestMatch(song, [original, { ...reissue, artists: [{ id: 'other', name: 'Akiko Kobayashi' }] }]), null)
  assert.equal(pickBestMatch(song, [original, { ...reissue, album: original.album }]), null)
  assert.equal(pickBestMatch(song, [{ ...original, duration_ms: 300600 }, reissue]), null)
})

test('reviewed romanized credits and missing subtitle are retrieval hints, not exemptions', () => {
  const cases = [
    [source('Groovy!', '広瀬香美', 266973), target('Groovy!', 'Kohmi Hirose', 259133)],
    [source('Gentle Shower', 'パイパー', 214000, { al: { name: 'SUMMER BREEZE' } }), target('Gentle Shower', 'PIPER', 228720, { album: { name: 'Summer Breeze' } })],
    [source('TSUNAMI', '有里知花', 365458), target('TSUNAMI', 'Chika Yuri', 365400)],
    [source('Find Out', '黒川沙良', 317347, { id: 441489617 }), target('Find out〜One Thing〜', 'Sala Kurokawa', 317000)],
  ]
  for (const [song, hit] of cases) {
    assert.ok(pickBestMatch(song, [hit]), song.name)
    assert.equal(pickBestMatch(song, [{ ...hit, duration_ms: hit.duration_ms + 90000 }]), null)
  }
})

test('bootleg and mashup cannot be replaced by the unmodified recording', () => {
  for (const edition of ['Bootleg', 'Mashup']) {
    assert.equal(pickBestMatch(source(`Plastic Love (${edition})`, 'TARA', 226273), [target('Plastic Love', 'TARA', 226273)]), null)
  }
  assert.equal(pickBestMatch(source('Sunset', 'BLU-SWING', 231653), [target('Sunset', 'BLU-SWING', 210546)]), null)
  const karen = source('The Way You Make Me Feel', '莫文蔚', 202856, { id: 277771 })
  assert.equal(pickBestMatch(karen, [target('The Way You Make Me Feel', 'Karen Mok', 208544, { id: '3PxBghSD7mhVd4ozof4XSd', album: { name: 'The Voyage' } })]), null)
})

test('last-resort aliases re-score existing pool without more search calls', async () => {
  const song = source('TSUNAMI', '有里知花', 365458)
  const queries = []
  const match = await findTrackMatch(song, async query => {
    queries.push(query)
    return [target('TSUNAMI', 'Chika Yuri', 365400)]
  })
  assert.equal(match.searchStage, 'manual-alias')
  assert.ok(!queries.some(q => q.includes('Chika Yuri')))
})

test('audit retains catalog aliases and explicit version/duration rejection reasons', async () => {
  const song = source('Song', 'Artist', 200000, { tns: ['曲'], al: { name: 'Album', alia: ['別名'] } })
  const view = sourceSongView(song)
  assert.deepEqual(view.titles, ['Song', '曲'])
  assert.deepEqual(view.albumNames, ['Album', '別名'])
  const diagnostics = {}
  await findTrackMatch(song, async () => [target('Song - Live at Tokyo / 2020', 'Artist', 280000)], diagnostics)
  assert.equal(diagnostics.reason, 'no-eligible-candidate')
  assert.ok(diagnostics.candidates[0].rejectionReasons.includes('recording-version'))
  assert.ok(diagnostics.candidates[0].rejectionReasons.includes('duration'))
})
