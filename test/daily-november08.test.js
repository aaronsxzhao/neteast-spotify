import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november08.json', import.meta.url)))
const fixed = new Map([[156288, '7tC6ami9OxhNYP6ykcKAct'], [454828889, '2yGDozozwXW9y6Pmgilkfo']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 8 complete review: ' + source.name, async () => {
    const expected = fixed.get(source.id)
    assert.equal(match(source, candidates)?.candidate.id, expected)
    if (!expected) return
    const correct = candidates.find(c => c.id === expected)
    const diagnostics = {}
    const direct = await findTrackMatch(source, async () => assert.fail('unnecessary search'), diagnostics, {
      allowAlternateVersions: true,
      findKnownTracks: async (_, { ids, takeQuery }) => {
        assert.deepEqual(ids, [expected]); assert.ok(takeQuery()); return [correct]
      },
    })
    assert.equal(direct?.candidate.id, expected)
    assert.equal(diagnostics.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...source, id: 0 }), [])
    for (const wrong of [{ ...correct, artists: [{ name: 'Other Singer' }] },
      { ...correct, is_playable: false }, { ...correct, name: correct.name + ' - Instrumental' }]) {
      assert.equal(match(source, [wrong]), null)
    }
  })
}
test('Wu Bai band credit mapping requires reviewed source, title, album and duration', () => {
  const { source, candidates } = rows.find(r => r.source.id === 156288)
  const correct = candidates.find(c => c.id === fixed.get(source.id))
  for (const wrong of [{ ...correct, album: { name: 'Other Album' } },
    { ...correct, duration_ms: correct.duration_ms + 10000 },
    { ...correct, artists: [...correct.artists, { name: 'Other Guest' }] }]) assert.equal(match(source, [wrong]), null)
  for (const wrong of [{ ...source, id: 0 }, { ...source, name: 'Other Song' },
    { ...source, ar: [{ name: 'China Blue' }] }]) assert.equal(match(wrong, [correct]), null)
})
test('all reviewed market-blocked releases stay rejected', () => {
  let count = 0
  for (const { source, candidates } of rows) for (const c of candidates.filter(c => c.is_playable === false)) {
    count++; assert.equal(match(source, [c]), null)
  }
  assert.equal(count, 3)
})
test('November 8 preserves all 27 imported Spotify IDs', () => {
  const confirmed = JSON.parse(fs.readFileSync(new URL('./fixtures/november08-confirmed.json', import.meta.url)))
  assert.equal(confirmed.length, 27)
  for (const { source, candidate } of confirmed) assert.equal(match(source, [candidate])?.candidate.id, candidate.id, source.name)
})
