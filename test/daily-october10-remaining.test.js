import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion, songSearchStages, songTitles } from '../src/matcher.js'

const source = (id, name, artists, album, dt) => ({ id, name, ar: artists.map(name => ({ name })), al: { name: album }, dt })
const target = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })), album: { name: album }, duration_ms, is_playable: true })

// First two: saved API candidates. Remaining five: public catalog metadata;
// whole-second lengths approximate the page display. Availability is mocked,
// NOT a claim of successful live retrieval or account-market playability.
const cases = [
  [source(29709498, '고장난 선풍기', ['MC 몽', 'Gary', '孝琳'], 'MISS ME OR DISS ME', 257488),
    target('6kwsi5SsN9zjeSDQvNTrnj', 'Broken fan (feat.Gary, Hyorin of Sistar)', ['MC MONG', 'GARY', 'Hyorin of Sistar'], 'MISS ME OR DISS ME', 257488)],
  [source(28590221, '이젠 너 없이도 (feat.윤미래, 타이거 JK, Bizzy)', ['EUNA KIM', '尹美莱', 'Tiger JK', '비지 (Bizzy)'], 'Love me Love', 217120),
    target('3qR4sYUDzIfYXwVkUusi8H', 'Without you now (feat.T, Tiger, Bizzy)', ['Euna Kim', 'Bizzy', 'T', 'Tiger'], 'Love me Love', 217120)],
  [source(3399839173, '甲乙丙丁 (你我怎么两清)', ['李佳薇'], '甲乙丙丁', 210461),
    target('629FqLOdjtsXh5b45FTk43', '甲乙丙丁Strangers', ['Jess Lee'], '甲乙丙丁Strangers', 210000)],
  [source(812400, 'PLANET', ['ラムジ'], '3ラムジ', 243400),
    target('5Zy4OB1HiZA1FSpoOKKfPo', 'PLANET', ['Labmsey'], '3ラムジ', 243400)],
  [source(2012146052, '真夜中のドア/Stay With Me', ['松原みき'], 'Paradise Beach', 309786),
    target('5DCLkzuWICNar6qn3B393f', '真夜中のドア〜stay with me', ['Miki Matsubara'], 'POCKET PARK (Remastered)', 311000)],
  [source(85571, '我们俩', ['郭顶'], '微微', 193600),
    target('3adCRGhoyecriPYS7mAwIz', '我们俩', ['郭顶'], '微微', 193000)],
  [source(22722696, '空を見上げて', ['河合その子'], 'Replica', 261067),
    target('1U8vzpsCm1ImJogHMheScv', '空を見上げて', ['河合その子'], 'sonnet', 261000)],
]

test('seven reviewed pointers resolve with one budgeted lookup, only after normal scoring', async () => {
  for (const [s, c] of cases) {
    assert.deepEqual(knownTrackIds(s), [c.id])
    assert.equal(pickBestMatch(s, [c])?.candidate.id, c.id, s.name)
    const d = {}; let requests = 0
    const result = await findTrackMatch(s, async () => { throw new Error('unnecessary search') }, d, {
      findKnownTracks: async (_song, { takeQuery }) => { assert.ok(takeQuery()); requests++; return [c] },
    })
    assert.equal(result?.candidate.id, c.id, s.name)
    assert.equal(result.searchStage, 'known-track')
    assert.equal(d.catalogQueryCount, 1)
    assert.equal(requests, 1)
    for (const changed of [{ ...s, id: -1 }, { ...s, name: 'Another song' }, { ...s, ar: [{ name: 'Another singer' }] }]) {
      assert.deepEqual(knownTrackIds(changed), [])
    }
  }
})

test('pointers never force covers or unavailable tracks; fallback respects shared budgets', async () => {
  for (const [s, c] of cases) {
    for (const bad of [
      { ...c, is_playable: false },
      { ...c, is_playable: false, catalogAvailability: 'unknown' },
      { ...c, artists: [{ name: 'Other singer' }, ...c.artists.slice(1)] },
    ]) {
      const d = {}
      const result = await findTrackMatch(s, async () => [], d, {
        findKnownTracks: async (_song, { takeQuery }) => takeQuery() ? [bad] : [], allowAlternateVersions: true,
      })
      assert.equal(result, null, `${s.name}: bad pointer`)
      assert.ok(d.catalogQueryCount <= 18)
    }
    for (const maxQueries of [0, 1, 4, 18]) {
      const d = {}; let calls = 0
      await findTrackMatch(s, async () => { calls++; return [] }, d, {
        findKnownTracks: async (_song, { takeQuery }) => { if (takeQuery()) calls++; return [] },
        maxQueries, allowAlternateVersions: true,
      })
      assert.ok(calls <= maxQueries)
      assert.equal(calls, d.catalogQueryCount)
    }
    const result = await findTrackMatch(s, async () => [{ ...c, id: 'playable-reissue' }], {}, {
      findKnownTracks: async (_song, { takeQuery }) => takeQuery() ? [{ ...c, is_playable: false }] : [],
      allowAlternateVersions: true,
    })
    assert.equal(result?.candidate.id, 'playable-reissue', s.name)
  }
})

test('both translated fields get an early paired query without the pointer or more requests', async () => {
  for (const i of [0, 2]) {
    const [s, c] = cases[i]
    const wanted = i === 0 ? 'track:"Broken fan" artist:"MC MONG"' : 'track:"甲乙丙丁Strangers" artist:"Jess Lee"'
    assert.equal(songSearchStages(s).find(stage => stage.manual).queries[0], wanted)
    const seen = [], d = {}
    const result = await findTrackMatch(s, async q => { seen.push(q); return q === wanted ? [c] : [] }, d)
    assert.equal(result?.candidate.id, c.id)
    assert.equal(new Set(seen).size, seen.length)
    assert.ok(d.catalogQueryCount <= 18)
  }
  const [s, c] = cases[3]
  assert.ok(songSearchStages(s).find(stage => stage.manual).queries.slice(0, 2).includes('track:"PLANET" artist:"Labmsey"'))
  const result = await findTrackMatch(s, async q => q === 'track:"PLANET" artist:"Labmsey"' ? [c] : [])
  assert.equal(result?.candidate.id, c.id)
})

test('new translated titles remain source-scoped and do not erase language subtitles', () => {
  for (const [s, c] of cases.slice(0, 3)) {
    for (const changed of [{ ...s, id: -1 }, { ...s, name: 'Another song' }, { ...s, ar: [{ name: 'Other singer' }] }]) {
      assert.equal(pickBestMatch(changed, [c]), null)
      assert.equal(pickAlternateVersion(changed, [c]), null)
    }
  }
  const [s, c] = cases[2]
  const cantonese = { ...c, name: '甲乙丙丁 (粤语版)' }
  assert.equal(pickBestMatch(s, [cantonese]), null)
  assert.equal(pickAlternateVersion(s, [cantonese]), null)
})

test('feature-credit query cleanup handles no-space Korean and Latin credits, not title words', () => {
  for (const name of ['Song (feat.윤미래)', 'Song (feat.Gary)', 'Song feat.Gary', 'Song [ft.Gary]', 'Song featuring Gary']) {
    const s = source(0, name, ['Singer'], '', 200000)
    assert.equal(songSearchStages(s)[0].queries[0], 'track:"Song" artist:"Singer"')
  }
  for (const name of ['Defeat', 'Features', 'Song feature story', 'Song (Live)']) {
    assert.ok(songSearchStages(source(0, name, ['Singer'], '', 200000))[0].queries[0].includes(`track:"${name}"`))
  }
})

test('inst abbreviations cannot substitute vocals in strict or alternate matching', () => {
  const [s, c] = cases[1]
  for (const label of ['(inst)', '(Inst.)', '[INST]', '（ inst. ）', ' - Inst.', '〈inst〉']) {
    const backing = { ...c, id: 'backing', name: `Without you now ${label}`, artists: [{ name: 'Euna Kim' }] }
    assert.equal(pickBestMatch(s, [backing]), null, label)
    assert.equal(pickAlternateVersion(s, [backing]), null, label)
    assert.equal(pickBestMatch(s, [backing, c])?.candidate.id, c.id)
  }
  const instrumental = source(0, 'Song (Inst.)', ['Singer'], '', 200000)
  const backing = target('backing', 'Song (Instrumental)', ['Singer'], '', 200000)
  assert.ok(pickBestMatch(instrumental, [backing]))
  assert.equal(pickAlternateVersion(instrumental, [{ ...backing, name: 'Song' }]), null)
  assert.ok(pickBestMatch(source(0, 'Instinct', ['Singer'], '', 200000), [{ ...backing, name: 'Instinct' }]))
  const names = songTitles(source(0, '우리 (Inst.)', ['Singer'], '', 200000))
  assert.ok(!names.includes('Inst.'))
})
