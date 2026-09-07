import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, pickBestMatch, scoreCandidate, similarity, songSearchQueries } from '../src/matcher.js'

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
