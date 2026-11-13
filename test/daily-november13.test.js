import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november13.json', import.meta.url)))
const fixed = new Map([[156736, '0NAcDn6U2GB2Arhspmh38S'], [299445, '7wL87unK7Vi96HM0I5vgB0'], [4875911, '5R6L4K7zPKlab8UszDR0x0']])
const match = (s, cs) => pickBestMatch(s, cs) || pickAlternateVersion(s, cs)
for (const { source, candidates } of rows) {
  test('November 13 complete review: ' + source.name, async () => {
    const expected = fixed.get(source.id)
    if (source.id === 4875911) assert.ok(['5R6L4K7zPKlab8UszDR0x0', '1ZEOIhSn6BKErV59bIgn76'].includes(match(source, candidates)?.candidate.id))
    else assert.equal(match(source, candidates)?.candidate.id, expected)
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
test('band credit is source scoped and keeps recording corroboration', () => {
 const { source, candidates } = rows.find(r => r.source.id === 156736)
 const c = candidates.find(c => c.id === fixed.get(source.id))
 for (const s of [{...source,id:0}, {...source,name:'Other song',tns:[]}]) assert.equal(match(s,[c]),null)
 assert.equal(match(source,[{...c,album:{name:'Unrelated'},duration_ms:c.duration_ms+15000}]),null)
})
test('split soundtrack components cannot replace the complete source', () => {
 const {source,candidates}=rows.find(r=>r.source.id===5057823)
 for (const c of candidates) assert.equal(match(source,[c]),null)
})
test('all 19 imported tracks retain their Spotify IDs', () => {
 const confirmed = JSON.parse(fs.readFileSync(new URL('./fixtures/november13-confirmed.json', import.meta.url)))
 assert.equal(confirmed.length,19)
 for (const {source,candidate} of confirmed) assert.equal(match(source,[candidate])?.candidate.id,candidate.id,source.name)
})
