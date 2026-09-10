import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, pickBestMatch, scoreCandidate, similarity, songSearchQueries, songTitles, titleVariants, songSearchStages, findTrackMatch } from '../src/matcher.js'

const song = {
  name: 'Blinding Lights',
  ar: [{ name: 'The Weeknd' }],
  al: { name: 'After Hours' },
  dt: 200_040,
}

test('normalize removes edition noise and punctuation', () => {
  assert.equal(normalize('Hello (Remastered 2011)!'), 'hello 2011')
})

test('similarity handles accents and small title additions', () => {
  assert.equal(similarity('Beyoncé', 'Beyonce'), 1)
  assert.ok(similarity('Blinding Lights', 'Blinding Lights - Radio Edit') > 0.85)
})

test('scoreCandidate strongly rewards title, artist, and duration', () => {
  const score = scoreCandidate(song, {
    name: 'Blinding Lights',
    artists: [{ name: 'The Weeknd' }],
    album: { name: 'After Hours' },
    duration_ms: 200_100,
  })
  assert.equal(score, 1)
})

test('pickBestMatch rejects an unrelated track', () => {
  const result = pickBestMatch(song, [{
    name: 'Yellow Submarine',
    artists: [{ name: 'The Beatles' }],
    album: { name: 'Revolver' },
    duration_ms: 158_000,
  }])
  assert.equal(result, null)
})

test('cross-catalog alias matches a romanized Spotify title', () => {
  const source = {
    name: '自転車にのって',
    ar: [{ name: 'KYOZO & BUN' }],
    al: { name: 'トラベリン’・バンド' },
    dt: 328_120,
  }
  const candidate = {
    name: 'Jitenshani Notte',
    artists: [{ name: 'KYOZO' }, { name: 'BUN' }],
    album: { name: "TRAVELIN' BAND" },
    duration_ms: 328_120,
  }
  assert.ok(scoreCandidate(source, candidate) > 0.9)
  assert.ok(songSearchQueries(source).some((query) => query.includes('Jitenshani Notte')))
})

test('cross-catalog alias matches English and Japanese Rainy Saturday titles', () => {
  const junkoSource = {
    name: 'Rainy Saturday Coffee Break',
    ar: [{ name: '大橋純子' }, { name: '美乃家セントラル・ステイション' }],
    al: { name: 'Pacific Breeze 2' },
    dt: 223_373,
  }
  const japaneseCandidate = {
    name: 'レイニー・サタデイ＆コーヒー・ブレイク',
    artists: [{ name: 'Junko Ohashi' }, { name: '美乃家セントラルステイション' }],
    album: { name: 'RAINBOW' },
    duration_ms: 225_680,
  }
  const tetsujiSource = {
    name: 'Rainy Saturday ＆ Coffee Break',
    ar: [{ name: '林哲司' }, { name: '大橋純子' }],
    al: { name: 'Back Mirror' },
    dt: 210_311,
  }
  const englishCandidate = {
    name: 'Rainy Saturday & Coffee Break - 50th Anniversary version',
    artists: [{ name: 'Tetsuji Hayashi' }],
    album: { name: 'Yesterday Alone(VAP Edition)' },
    duration_ms: 214_080,
  }
  assert.ok(scoreCandidate(junkoSource, japaneseCandidate) > 0.85)
  assert.ok(scoreCandidate(tetsujiSource, englishCandidate) > 0.8)
})

test('cross-catalog aliases match Korean titles and romanized artists', () => {
  const someSource = {
    name: '썸',
    ar: [{ name: '昭宥' }, { name: '정기고' }, { name: '릴보이' }],
    al: { name: '썸' },
    dt: 211_000,
  }
  const someCandidate = {
    name: 'Some (feat. Lil Boi)',
    artists: [{ name: 'SOYOU' }, { name: 'Junggigo' }, { name: 'Lil Boi' }],
    album: { name: 'Some' },
    duration_ms: 211_100,
  }
  const hyolynSource = {
    name: "사랑 하지 마 (Don't Love Me)",
    ar: [{ name: '孝琳' }],
    al: { name: 'LOVE & HATE' },
    dt: 220_000,
  }
  const hyolynCandidate = {
    name: "Don't Love Me",
    artists: [{ name: 'HYOLYN' }],
    album: { name: 'LOVE & HATE' },
    duration_ms: 220_100,
  }

  assert.ok(scoreCandidate(someSource, someCandidate) > 0.95)
  assert.ok(songSearchQueries(someSource).some((query) => query.includes('Some')))
  assert.ok(scoreCandidate(hyolynSource, hyolynCandidate) > 0.95)
  assert.ok(songSearchQueries(hyolynSource).some((query) => query.includes("Don't Love Me")))
})

test('artist alias matches the romanized Tomoyo Harada credit', () => {
  const source = {
    name: 'うたかたの恋',
    ar: [{ name: '原田知世' }],
    al: { name: '恋愛小説4～音楽飛行' },
    dt: 238_000,
  }
  const candidate = {
    name: 'うたかたの恋',
    artists: [{ name: 'Tomoyo Harada' }],
    album: { name: 'Love Song Covers 4' },
    duration_ms: 238_100,
  }

  assert.ok(scoreCandidate(source, candidate) > 0.95)
  assert.ok(songSearchQueries(source).some((query) => query.includes('Tomoyo Harada')))
})

test('splits bilingual titles without a hand-written alias, in either catalog', () => {
  const source = { name: '새로운 아침（A New Morning）', ar: [{ name: '새가수' }], dt: 210_000 }
  assert.deepEqual(titleVariants(source.name), ['새로운 아침(A New Morning)', '새로운 아침', 'A New Morning'])
  const candidate = { name: 'A New Morning', artists: [{ name: 'New Singer' }], duration_ms: 210_100 }
  assert.ok(pickBestMatch(source, [candidate], 0.68, { manual: false }))
  assert.ok(pickBestMatch({ ...source, name: 'A New Morning' }, [{ ...candidate, name: source.name }], 0.68, { manual: false }))
})

test('uses tns, transNames, alia, alias and artist/album metadata before manual aliases', () => {
  const source = {
    name: '原曲', tns: ['First Translation'], transNames: 'Second Translation', alia: ['Third Translation'], alias: ['Fourth Translation'],
    ar: [{ name: '歌手', alia: ['Singer Name'] }], al: { name: '专辑', tns: ['Album Name'] }, dt: 200_000,
  }
  assert.equal(songTitles(source, { manual: false }).length, 5)
  const stages = songSearchStages(source)
  assert.ok(stages[0].queries.includes('track:"Third Translation" artist:"Singer Name"'))
  const candidate = { name: 'Third Translation', artists: [{ name: 'Singer Name' }], album: { name: 'Album Name' }, duration_ms: 200_000 }
  assert.equal(scoreCandidate(source, candidate, { manual: false }), 1)
  assert.deepEqual(songTitles({ name: 'Title', alia: [null, 5, {}] }), ['Title'])
})

test('does not turn edition labels or ordinary subtitles into search titles', () => {
  for (const name of ['곡 (Live)', '곡 (Acoustic Version)', '곡 (feat. Someone)', 'Escape (The Journey)', '曲【伴奏】']) {
    assert.deepEqual(titleVariants(name), [name])
  }
})

test('title-only search recovers unlisted cross-language credits before manual fallback', async () => {
  const source = { name: 'うたかたの恋', ar: [{ name: '原田知世' }], dt: 238_000 }
  const candidate = { id: 'correct', name: source.name, artists: [{ name: 'Tomoyo Harada' }], duration_ms: 238_100 }
  const calls = []
  const match = await findTrackMatch(source, async (query) => {
    calls.push(query)
    return query === `track:"${source.name}"` ? [candidate] : []
  })
  assert.equal(match.candidate.id, 'correct')
  assert.equal(match.searchStage, 'title-only')
  assert.equal(calls.some((query) => query.includes('Tomoyo Harada')), false)
})

test('manual aliases are only searched and scored after metadata and title-only fail', async () => {
  const source = { name: '썸', ar: [{ name: '昭宥' }], dt: 211_000 }
  const candidate = { id: 'some', name: 'Some (feat. Lil Boi)', artists: [{ name: 'SOYOU' }], duration_ms: 211_100 }
  const calls = []
  const match = await findTrackMatch(source, async (query) => {
    calls.push(query)
    return [candidate]
  })
  assert.equal(match.searchStage, 'manual-alias')
  assert.ok(calls.includes('track:"썸"'))
  // The candidate was already retrieved: manual scoring may now reuse it,
  // but only after all metadata stages have failed.
  assert.ok(!calls.some(query => query.includes('Some')))
  assert.equal(new Set(calls).size, calls.length)
})

test('scores all candidates from a search stage instead of accepting the first response', async () => {
  const source = { ...song, tns: ['Alternate Name'] }
  const weak = { id: 'weak', name: song.name, artists: [{ name: 'The Weeknd' }], duration_ms: 215_000 }
  const correct = { ...weak, id: 'correct', album: { name: 'After Hours' }, duration_ms: 200_000 }
  const match = await findTrackMatch(source, async (query) => query.includes('Alternate') ? [correct] : [weak])
  assert.equal(match.candidate.id, 'correct')
})

test('exact title, primary artist, album and duration stop redundant alias searches', async () => {
  const source = { ...song, tns: ['Translated Title', 'Another Alias'] }
  let calls = 0
  const match = await findTrackMatch(source, async () => {
    calls++; return [{ id: 'exact', name: song.name, artists: song.ar, album: song.al, duration_ms: song.dt }]
  })
  assert.equal(match.candidate.id, 'exact'); assert.equal(match.earlyExit, true)
  assert.equal(calls, 1)
})

test('fast matching never skips an ambiguous result pool or accepts guest-only identity', async () => {
  const source = { ...song, tns: ['Translated Title'] }
  let calls = 0
  const match = await findTrackMatch(source, async () => {
    calls++; return ['one', 'two'].map(id => ({ id, name: song.name, artists: [{ name: 'The Weeknd', id }], album: song.al, duration_ms: song.dt }))
  })
  assert.equal(match, null); assert.ok(calls > 1)
  const guest = await findTrackMatch(source, async () => [{id:'guest', name:song.name, artists:[{name:'Another Artist'},...song.ar],album:song.al,duration_ms:song.dt}])
  assert.notEqual(guest?.earlyExit, true)
})

test('cross-language matches require exact title, tight duration, and evidence for short titles', () => {
  const source = { name: 'Some', ar: [{ name: '歌手' }], al: { name: 'Summer Album' }, dt: 210_000 }
  const candidate = { name: 'Some', artists: [{ name: 'Singer' }], duration_ms: 210_000 }
  assert.equal(pickBestMatch(source, [candidate], 0.68, { manual: false }), null)
  assert.ok(pickBestMatch(source, [{ ...candidate, album: { name: 'Summer Album' } }], 0.68, { manual: false }))
  const long = { ...source, name: 'A New Morning' }
  const target = { ...candidate, name: long.name }
  assert.ok(pickBestMatch(long, [target], 0.68, { manual: false }))
  for (const extra of [{ duration_ms: 215_000 }, { duration_ms: 0 }, { name: 'A New Morning Tomorrow' }, { artists: [] }]) {
    assert.equal(pickBestMatch(long, [{ ...target, ...extra }], 0.68, { manual: false }), null)
  }
})

test('same-script conflicting artists cannot pass on exact title and duration alone', () => {
  const source = { name: '거짓말', ar: [{ name: 'BIGBANG' }], dt: 229_000 }
  const candidate = { name: source.name, artists: [{ name: 'Jo Hang Jo' }], duration_ms: 229_000 }
  assert.equal(pickBestMatch(source, [candidate]), null)
})

test('rejects live, acoustic, remix, instrumental and speed-altered editions', () => {
  const candidate = { name: song.name, artists: song.ar, duration_ms: song.dt, album: song.al }
  for (const edition of ['Live', 'Acoustic', 'Remix', 'Instrumental', 'Sped Up']) {
    assert.equal(pickBestMatch(song, [{ ...candidate, name: `${song.name} - ${edition}` }]), null)
  }
  assert.ok(pickBestMatch(song, [{ ...candidate, name: `${song.name} - Remastered` }]))
  assert.ok(pickBestMatch({ ...song, name: `${song.name} (Live)` }, [{ ...candidate, name: `${song.name} - Live` }]))
})

test('leaves ambiguous cross-language recordings unmatched but accepts duplicate releases', () => {
  const source = { name: 'A New Morning', ar: [{ name: '新歌手' }], dt: 210_000 }
  const a = { id: 'a', name: source.name, artists: [{ id: 'artist-a', name: 'Singer One' }], duration_ms: 210_000 }
  const b = { ...a, id: 'b', artists: [{ id: 'artist-b', name: 'Singer Two' }] }
  assert.equal(pickBestMatch(source, [a, b], 0.68, { manual: false }), null)
  assert.ok(pickBestMatch(source, [a, { ...a, id: 'reissue', album: { name: 'Compilation' } }], 0.68, { manual: false }))
  assert.equal(pickBestMatch(source, [{ ...a, is_playable: false }]), null)
})

test('the exact reported HYOLYN fields work without manual aliases, including a backtick', async () => {
  const source = { name: '사랑 하지 마 (Don`t Love Me)', ar: [{ name: '孝琳' }], al: { name: 'LOVE & HATE' }, dt: 220_000 }
  const candidate = { id: 'hyolyn', name: "Don't Love Me", artists: [{ name: 'HYOLYN' }], album: { name: 'LOVE & HATE' }, duration_ms: 220_100 }
  assert.ok(pickBestMatch(source, [candidate], 0.68, { manual: false }))
  const result = await findTrackMatch(source, async (query) => query.includes('artist:') ? [] : [candidate])
  assert.equal(result.searchStage, 'title-only')
})

test('same artist and title do not override a major duration discrepancy', () => {
  assert.equal(pickBestMatch(song, [{ name: song.name, artists: song.ar, album: song.al, duration_ms: song.dt + 60_000 }]), null)
})
