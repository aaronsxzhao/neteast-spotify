import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november07.json', import.meta.url)))
const fixed = new Map([[3419824228, '4il15pZcNNkbwLMrI7dBaC'], [29827508, '4HKsAa7XAvZZs1x0Betdkx'],
  [29122850, '43JGCJZuHcqyVA2hyL4cIX'], [234064, '0a8mmtNx7Gwa9Uav1UgAQX']])
const match = (s, c) => pickBestMatch(s, c) || pickAlternateVersion(s, c)
for (const { source, candidates } of rows) {
  test('November 7 full review: ' + source.name, async () => {
    const expected = fixed.get(source.id)
    const hit = match(source, candidates)
    assert.equal(hit?.candidate.id, expected)
    if (!expected) return
    assert.equal(Boolean(hit.alternateVersion), source.id === 29122850)
    const correct = candidates.find(c => c.id === expected)
    const diagnostics = {}
    const direct = await findTrackMatch(source, async () => assert.fail("unnecessary search after verified pointer"), diagnostics, {
      allowAlternateVersions: true,
      findKnownTracks: async (_, { ids, takeQuery }) => {
        assert.deepEqual(ids, [expected]); assert.ok(takeQuery()); return [correct]
      },
    })
    assert.equal(direct?.candidate.id, expected)
    assert.equal(diagnostics.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...source, id: 0 }), [])
    assert.deepEqual(knownTrackIds({ ...source, ar: [{ name: 'Other Singer' }] }), [])
    for (const wrong of [
      { ...correct, artists: [{ name: 'Other Singer' }] },
      { ...correct, is_playable: false },
      { ...correct, name: correct.name + ' - Instrumental' },
    ]) assert.equal(match(source, [wrong]), null)
  })
}
test('reviewed duets reject solo and changed guest in both matching passes', () => {
  for (const id of [3419824228, 29122850]) {
    const { source, candidates } = rows.find(r => r.source.id === id)
    const c = candidates.find(c => c.id === fixed.get(id))
    for (const artists of [c.artists.slice(0, 1), [c.artists[0], { name: 'Other Guest' }]]) {
      assert.equal(match(source, [{ ...c, artists }]), null)
    }
  }
  const { source, candidates } = rows[0]
  assert.equal(match(source, candidates.filter(c => c.artists.length === 1)), null)
})
test('Karen Mok restricted release remains rejected; playable release is selected', () => {
  const { source, candidates } = rows.find(r => r.source.id === 29827508)
  const blocked = candidates.find(c => c.id === '4lkCHTwVSfSd02i1IPhOz9')
  assert.equal(blocked.is_playable, false)
  assert.equal(match(source, [blocked]), null)
})
test('November 7 preserves all 26 confirmed imported Spotify IDs', () => {
  const confirmed = JSON.parse(fs.readFileSync(new URL('./fixtures/november07-confirmed.json', import.meta.url)))
  assert.equal(confirmed.length, 26)
  for (const { source, candidate } of confirmed) assert.equal(match(source, [candidate])?.candidate.id, candidate.id, source.name)
})
