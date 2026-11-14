import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november14.json', import.meta.url)))
const fixed = new Map([[1984474579, '5EvVYm1CnsyMuXtFnGQKH9']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 14 complete review: ' + source.name, async () => {
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
test('LaLa alias supports traditional source metadata without accepting the composer or covers', () => {
 const {source,candidates}=rows.find(r=>r.source.id===1984474579)
 const correct=candidates.find(c=>c.id===fixed.get(source.id))
 assert.equal(match({...source,ar:[{name:'徐佳瑩'}]},[correct])?.candidate.id,correct.id)
 for(const name of ['Silence Wang','Gigi Leung','Kelly Yu']) assert.equal(match(source,[{...correct,artists:[{name}]}]),null)
 assert.equal(match(source,[{...correct,name:'Other song'}]),null)
})
test('all 25 imported tracks retain their Spotify IDs', () => {
 const confirmed=JSON.parse(fs.readFileSync(new URL('./fixtures/november14-confirmed.json',import.meta.url)))
 assert.equal(confirmed.length,25)
 for(const {source,candidate} of confirmed) assert.equal(match(source,[candidate])?.candidate.id,candidate.id,source.name)
})
