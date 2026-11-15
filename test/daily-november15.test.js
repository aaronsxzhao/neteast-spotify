import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november15.json', import.meta.url)))
const fixed = new Map([[27158959, '5wwiq5TX0bFx4MrR2l9kc0']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 15 complete review: ' + source.name, async () => {
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
test('Utada identity does not accept same-title singers or unrelated songs', () => {
 const {source,candidates}=rows.find(r=>r.source.id===27158959)
 const c=candidates.find(c=>c.id===fixed.get(source.id))
 for(const name of ['Janet Jackson','RM','Jungle']) assert.equal(match(source,[{...c,artists:[{name}]}]),null)
 assert.equal(match(source,[{...c,name:'Other Song'}]),null)
 assert.equal(match(source,[candidates.find(c=>c.id==='74iRv2O8kvfItYz3yVeI1h')])?.candidate.id,'74iRv2O8kvfItYz3yVeI1h')
})
test('Japanese Happen Ending does not accept the different guest-language recording', () => {
 const {source,candidates}=rows.find(r=>r.source.id===29848057)
 assert.equal(match(source,[candidates[0]]),null)
})
test('all 22 imported tracks retain their Spotify IDs', () => {
 const confirmed=JSON.parse(fs.readFileSync(new URL('./fixtures/november15-confirmed.json',import.meta.url)))
 assert.equal(confirmed.length,22)
 for(const {source,candidate} of confirmed) assert.equal(match(source,[candidate])?.candidate.id,candidate.id,source.name)
})
