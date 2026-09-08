import test from 'node:test'
import assert from 'node:assert/strict'
import { similarity, songSearchStages, findTrackMatch, pickBestMatch } from '../src/matcher.js'

const source = (name, artist, duration, extra = {}) => ({ name, ar: [{ name: artist }], dt: duration, ...extra })
const target = (name, artist, duration, extra = {}) => ({ id: 'correct', name, artists: [{ id: 'artist', name: artist }], duration_ms: duration, ...extra })

test('script variants match canonically but remain distinct Spotify search queries', () => {
  for (const [a, b] of [['闭目入神', '閉目入神'], ['街灯晚餐', '街燈晚餐'], ['夏の终わり', '夏の終わり']]) {
    assert.equal(similarity(a, b), 1)
    const queries = songSearchStages(source(a, 'Artist', 200000)).flatMap(stage => stage.queries)
    assert.ok(queries.includes(`track:"${a}"`))
    assert.ok(queries.includes(`track:"${b}"`))
  }
})

test('eight reviewed catalog entries are recoverable with identity and duration checks', async () => {
  const cases = [
    [source('闭目入神', '郑中基', 216360), target('閉目入神', 'Ronald Cheng', 216000)],
    [source('夏の终わり', '森山直太朗', 346600), target('夏の終わり', 'Naotaro Moriyama', 346000)],
    [source('空に星が綺麗~悲しい吉祥寺~', '斉藤和義', 154250, { al: { name: 'FIRE DOG' } }), target('空に星が綺麗～悲しい吉祥寺～', 'Kazuyoshi Saito', 153000, { album: { name: 'FIRE DOG' } })],
    [source('春の森の回転木馬', '中嶋美智代', 187973, { id: 1317162660 }), target('Haru no Mori no Kaiten Mokuba', 'Michiyo Nakajima', 187000)],
    [source('처음만 힘들지', '015B', 205859, { tns: ['Hard to Start'] }), target('Hard to Start', '015B', 205000)],
    [source('街灯晚餐', '卫兰', 312906), target('街燈晚餐', 'Janice Vidal', 312000)],
    [source('Serendipity feat Tamala & Takurah', '西原健一郎', 238173), target('Serendipity', 'Kenichiro Nishihara', 238000)],
    [source('Sugao No Mamade', '大橋純子', 339373, { id: 1305365761 }), target('素顔のままで', 'Junko Ohashi', 339000)],
  ]
  for (const [song, candidate] of cases) {
    // Exact filters may miss localized names. Simulate Spotify's alias-aware
    // free-text retrieval, without letting a search hit itself prove identity.
    const match = await findTrackMatch(song, async query => query.includes('track:') ? [] : [candidate])
    assert.ok(match, song.name)
    assert.equal(match.candidate.id, 'correct')
    assert.equal(pickBestMatch(song, [{ ...candidate, duration_ms: candidate.duration_ms + 90000 }]), null)
  }
})

test('free-text retrieval removes feat credits and precedes curated aliases', () => {
  const stages = songSearchStages(source('Serendipity feat Tamala & Takurah', '西原健一郎', 238173))
  assert.ok(stages.find(stage => stage.name === 'free-text').queries.includes('Serendipity'))
  assert.ok(stages.flatMap(stage => stage.queries).every(query => !query.includes('feat Tamala')))
  assert.ok(stages.findIndex(stage => stage.name === 'free-text') < stages.findIndex(stage => stage.name === 'manual-alias'))
})

test('short partial title and artist names cannot accept the reported wrong song', async () => {
  const song = source('some', 'werf', 191611, { al: { name: 'some' } })
  const wrong = target('Someone to Blame', 'The Tony Slug Experience', 186000, {
    artists: [{ name: 'The Tony Slug Experience' }, { name: 'Steven van der Werff' }], album: { name: 'Someone To Blame' },
  })
  assert.ok(similarity('some', 'Someone to Blame') < 0.78)
  assert.ok(similarity('werf', 'Steven van der Werff') < 0.85)
  assert.equal(await findTrackMatch(song, async () => [wrong]), null)
})

test('localized guest IDs do not make a tightly aligned duplicate release ambiguous', () => {
  const song = source('처음만 힘들지', '015B', 205859, { tns: ['Hard to Start'] })
  const a = target('Hard to Start', '015B', 205800, { artists: [{ id: '015b', name: '015B' }, { id: 'guest-en', name: 'Nayul' }] })
  const b = { ...a, id: 'compilation', duration_ms: 207000, artists: [{ id: '015b', name: '015B' }, { id: 'guest-ko', name: '나율' }] }
  assert.ok(pickBestMatch(song, [a, b]))
  assert.equal(pickBestMatch(song, [a, { ...b, artists: [{ id: 'different', name: '015B' }] }]), null)
})

test('verified title translations are source-scoped and do not permit unrelated artists', () => {
  const candidate = target('素顔のままで', 'Unrelated Singer', 339373)
  assert.equal(pickBestMatch(source('Sugao No Mamade', 'Junko Ohashi', 339373, { id: 1305365761 }), [candidate]), null)
  assert.equal(pickBestMatch(source('Sugao No Mamade', 'Junko Ohashi', 339373), [target('素顔のままで', 'Junko Ohashi', 339373)]), null)
})

test('Hard to Start does not accept the distinct Original Ver. arrangement', () => {
  const song = source('처음만 힘들지', '015B', 205859, { tns: ['Hard to Start'] })
  assert.equal(pickBestMatch(song, [target('Hard to Start (Original Ver.)', '015B', 204000)]), null)
})

test('unmatched diagnostics retain bounded metadata, not raw provider responses', async () => {
  const diagnostics = {}
  const candidates = Array.from({ length: 20 }, (_, i) => ({ ...target('Other', 'Other', 120000), id: String(i), privateDebug: 'secret' }))
  assert.equal(await findTrackMatch(source('Expected', 'Singer', 200000), async () => candidates, diagnostics), null)
  assert.equal(diagnostics.candidateCount, 20)
  assert.equal(diagnostics.candidates.length, 5)
  assert.ok(diagnostics.queryCount > 0)
  assert.equal(JSON.stringify(diagnostics).includes('secret'), false)
})

test('subtitle query shortening retrieves without weakening full-title identity', async () => {
  const song = source('空に星が綺麗~悲しい吉祥寺~', '斉藤和義', 154250, { al: { name: 'FIRE DOG' } })
  const correct = target('空に星が綺麗～悲しい吉祥寺～', 'Kazuyoshi Saito', 153000, { album: { name: 'FIRE DOG' } })
  const match = await findTrackMatch(song, async query => query === 'track:"空に星が綺麗"' ? [correct] : [])
  assert.equal(match?.candidate.id, 'correct')
})

test('compound band names retain their full identity when splitting guest credits', () => {
  const song = source('Morning Selection (2019 Remaster)', 'Honey & B-Boys', 215080)
  assert.ok(pickBestMatch(song, [target('Morning Selection - 2019 Remaster', 'HONEY&B-BOYS', 215080)]))
})

test('alternate featured singer is not a rival for the verified recording', () => {
  const song = source('처음만 힘들지', '015B', 205859, { tns: ['Hard to Start'], ar: [{ name: '015B' }, { name: 'NAYUL' }] })
  const a = target('Hard to Start', '015B', 205859, { artists: [{ id: '015b', name: '015B' }, { id: 'nayul', name: 'Nayul' }] })
  const b = { ...a, id: 'compilation', duration_ms: 207227, artists: [{ id: '015b', name: '015B' }, { id: 'nayul-ko', name: '나율' }] }
  const other = { ...a, id: 'different-singer', name: '처음만 힘들지', duration_ms: 202971, artists: [{ id: '015b', name: '015B' }, { id: 'yozo', name: 'Yozo' }] }
  assert.equal(pickBestMatch(song, [other]), null)
  assert.equal(pickBestMatch(song, [a, b, other])?.candidate.id, 'correct')
})
