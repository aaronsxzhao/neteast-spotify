import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november09.json', import.meta.url)))
const fixed = new Map([[2047652597, '37XYyITs3EVTmU5eNrimEd'], [280765, '72K8evix8Y6R4oiwLw7EHG'], [29751583, '76X2KY7pDefceL4VDaeCJo']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 9 complete review: ' + source.name, async () => {
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
    for (const bad of [{ ...source, id: 0 }, { ...source, ar: [{ name: 'Other Singer' }] }]) assert.deepEqual(knownTrackIds(bad), [])
    for (const wrong of [{ ...correct, artists: [{ name: 'Other Singer' }] },
      { ...correct, is_playable: false }, { ...correct, name: correct.name + ' - Instrumental' }]) assert.equal(match(source, [wrong]), null)
  })
}
test('City Hunter rejects same-title near-duration cover by Shoko Nakagawa', () => {
  const { source, candidates } = rows.find(r => r.source.id === 29751583)
  const cover = candidates.find(c => c.id === '5NjBuIojlUUI69V86gCW6m')
  assert.equal(match(source, [cover]), null)
})
test('known market restrictions and Dear megamix remain rejected', () => {
  for (const id of [41632971, 22773568]) {
    const { source, candidates } = rows.find(r => r.source.id === id)
    assert.equal(match(source, candidates), null)
    for (const c of candidates) assert.equal(match(source, [c]), null)
  }
})
test('all 25 imported tracks retain their Spotify IDs', () => {
  const confirmed = JSON.parse(fs.readFileSync(new URL('./fixtures/november09-confirmed.json', import.meta.url)))
  assert.equal(confirmed.length, 25)
  for (const { source, candidate } of confirmed) assert.equal(match(source, [candidate])?.candidate.id, candidate.id, source.name)
})
