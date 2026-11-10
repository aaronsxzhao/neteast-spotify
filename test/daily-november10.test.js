import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november10.json', import.meta.url)))
const fixed = new Map([[498880671, '4nCHNiMsnSYT0am8S2ifI1'], [1938733035, '0EeDQLRSNWsZzNsyKsJ402'], [2020639987, '47NaTEPlCpA9owkdsn6ok7']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 10 complete review: ' + source.name, async () => {
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
test('Lily requires Mamiko and Rachel; shared guest or solo is insufficient', () => {
  const { source, candidates } = rows.find(r => r.source.id === 498880671)
  const c = candidates.find(c => c.id === fixed.get(source.id))
  for (const artists of [[c.artists[0]], [c.artists[1]], [{ name: 'Other Singer' }, c.artists[1]], [c.artists[0], { name: 'Other Guest' }]]) {
    assert.equal(match(source, [{ ...c, artists }]), null)
  }
})
test('reviewed romanized titles do not leak to other source IDs or songs', () => {
  for (const id of [1938733035, 2020639987]) {
    const { source, candidates } = rows.find(r => r.source.id === id)
    const c = candidates.find(c => c.id === fixed.get(id))
    assert.equal(match({ ...source, id: 0 }, [c]), null)
    assert.equal(match({ ...source, name: 'Unrelated title', tns: [] }, [c]), null)
  }
})
test('Rule retains live recording checks after title mapping', () => {
  const { source, candidates } = rows.find(r => r.source.id === 2020639987)
  const c = candidates.find(c => c.id === fixed.get(source.id))
  assert.equal(pickBestMatch(source, [c])?.candidate.id, c.id)
  assert.equal(pickBestMatch(source, [{ ...c, name: 'Rule (君に夢中)', album: { name: 'Studio' } }]), null)
  assert.equal(match(source, [{ ...c, name: 'Simple And Clean' }]), null)
})
test('all 26 imported tracks retain their Spotify IDs', () => {
  const confirmed = JSON.parse(fs.readFileSync(new URL('./fixtures/november10-confirmed.json', import.meta.url)))
  assert.equal(confirmed.length, 26)
  for (const { source, candidate } of confirmed) assert.equal(match(source, [candidate])?.candidate.id, candidate.id, source.name)
})
