import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickAlternateVersion, pickBestMatch, songSearchStages } from '../src/matcher.js'

// Safe catalog fields from the Sept 11 saved diagnostics. These are offline
// candidate replays, not a claim that a new live Spotify search has succeeded.
const source = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const target = (id, name, artists, album, duration_ms) => ({
  id, uri: `spotify:track:${id}`, name, artists: artists.map(name => ({ name })), album: { name: album }, duration_ms,
})
const cases = [
  {
    song: source(446297, 'LA･LA･LA LOVE SONG', '久保田利伸', 'LA・LA・LA LOVE SONG', 286557),
    candidates: [
      target('5dEojWGT3junlaa989hzGL', 'LA･LA･LA LOVE SONG', ['Toshinobu Kubota', 'Naomi Campbell'], 'LA・LA・LA LOVE SONG', 289000),
      target('2NFKSwzaNKXAqBqlXgeTEo', 'LA･LA･LA LOVE SONG', ['Toshinobu Kubota', 'Naomi Campbell'], 'LA･LA･LA LOVE THANG', 286493),
    ], expected: '2NFKSwzaNKXAqBqlXgeTEo',
  },
  {
    song: source(1996902507, 'Morning Subway', '新井正人', 'Masahito Arai', 261666),
    candidates: [
      target('1yV4LMdgd2GIkZgvSA0zNg', 'Morning Subway', ['Soyoo'], 'Cafeteria Crush', 257720),
      target('2xAEmwYwLoDXt37bOaMhSO', 'モーニング・サブウェイ - 2015 Remaster', ['新井正人'], 'MASAHITO ARAI (+1; 2015 Remaster)', 261746),
      target('5HNwvkpQCLEh9Y0Nry43e1', '冬のフォトグラフ - 2015 Remaster', ['新井正人'], 'MASAHITO ARAI (+1; 2015 Remaster)', 264280),
    ], expected: '2xAEmwYwLoDXt37bOaMhSO',
  },
  {
    song: source(1358089285, 'Solitude -band ver-', 're:plus', 'reincarnation', 356789),
    candidates: [
      target('0aux8sSIYjx16SAjYTva3I', 'solitude', ['re:plus band set'], 'reincarnation', 356789),
      target('1ghPHoNXf4L5wO4kOvJUoW', 'Solitude', ['re:plus'], 'Ordinary Landscape', 256133),
    ], expected: '0aux8sSIYjx16SAjYTva3I',
  },
  {
    song: source(1824185544, 'Wave', '山根麻以', 'たそがれ', 280680),
    candidates: [target('6eapZHlYM5SAqpyWeLhTjf', 'Wave', ['Mai Yamane'], 'Tasogare', 279379)],
    expected: '6eapZHlYM5SAqpyWeLhTjf',
  },
]

test('four Sept 11 misses are recovered by rescoring the saved pool without new alias searches', async () => {
  for (const { song, candidates, expected } of cases) {
    const queries = []
    const metadataQueries = songSearchStages(song).filter(s => !s.manual).flatMap(s => s.queries)
    const match = await findTrackMatch(song, async q => { queries.push(q); return candidates }, {}, { allowAlternateVersions: true })
    assert.equal(match?.candidate.id, expected, song.name)
    assert.ok(queries.every(q => metadataQueries.includes(q)), `${song.name}: no extra alias requests`)
    assert.equal(queries.length, new Set(queries).size)
  }
})

test('the remaining three misses are not replaced with other artists or unrelated titles', async () => {
  const misses = [
    [source(211520, '你不要那样看着我的眼睛', '蔡琴', '你不要那样看着我的眼睛', 273000),
      target('0jX5FZrpoVAWyUvpa13uU8', '你不要那样看着我的眼睛', ['黄绮珊'], '爱的归途', 231191)],
    [source(26131353, '微熱', '小林麻美', 'CRYPTOGRAPH～愛の暗号～', 280000),
      target('2bmpBLftJYA9jnpAdYfW5g', '微熱', ['MOON CHILD'], '微熱', 274200)],
    [source(22671888, 'HEARTでふりむいて', '和田加奈子', 'DESSERTに星くずのゼリーを', 243093),
      target('4Co1OjIiGp0Fa5yr7rndy1', 'Heart 111', ['yuri'], 'Heart 111', 112093)],
  ]
  for (const [song, candidate] of misses) {
    assert.equal(await findTrackMatch(song, async () => [candidate], {}, { allowAlternateVersions: true }), null)
  }
})

test('band credit exception cannot leak to another song, source ID or artist', () => {
  const { song, candidates: [candidate] } = cases[2]
  assert.ok(pickAlternateVersion(song, [candidate]))
  for (const changed of [{ id: 999 }, { name: 'Different Song' }, { ar: [{ name: 'Other Artist' }] }]) {
    assert.equal(pickAlternateVersion({ ...song, ...changed }, [candidate]), null)
  }
  assert.equal(pickAlternateVersion(song, [{ ...candidate, is_playable: false }]), null)
})

test('compact version delimiters work generally without deleting ordinary subtitles', () => {
  const song = source(1, 'Night Train', 'A Band', 'Album', 200000)
  const candidate = target('candidate', song.name, ['A Band'], 'Album', 230000)
  for (const suffix of [' -band ver-', ' - band version', '—Live', ' - 2015 Remaster', ' -ライブ']) {
    assert.ok(pickAlternateVersion({ ...song, name: song.name + suffix }, [candidate]), suffix)
  }
  for (const suffix of ['-bound', ' - Another Story', ' - We Live Together']) {
    assert.equal(pickAlternateVersion({ ...song, name: song.name + suffix }, [candidate]), null, suffix)
  }
})

test('year-prefixed remasters align without treating a live edition as a studio recording', () => {
  const song = source(1, 'Night Train', 'A Band', 'Album', 200000)
  const candidate = target('candidate', 'Night Train - 2015 Remaster', ['A Band'], 'Album', 200080)
  assert.ok(pickBestMatch(song, [candidate]))
  assert.equal(pickBestMatch(song, [{ ...candidate, name: 'Night Train - 2015 Live' }]), null)
})

test('translation fallback remains source-scoped; equal duration cannot prove another title', () => {
  const { song, candidates } = cases[1]
  assert.equal(pickBestMatch({ ...song, id: 999 }, [candidates[1]]), null)
  assert.equal(pickBestMatch(song, [{ ...candidates[2], duration_ms: song.dt }]), null)
})

test('new matching paths propagate 429 immediately without trying fallback queries', async () => {
  for (const { song } of cases) {
    let calls = 0
    await assert.rejects(findTrackMatch(song, async () => {
      calls++; throw Object.assign(new Error('Provider cooldown'), { status: 429 })
    }, {}, { allowAlternateVersions: true }), { status: 429 })
    assert.equal(calls, 1)
  }
})
