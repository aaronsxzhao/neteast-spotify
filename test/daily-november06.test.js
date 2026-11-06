import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'

const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/november06.json', import.meta.url)))
const fixed = new Map([[28838055, '4dtGOHiORFemWpob6iNcSu'], [601458, '50yyhKQf0FyRw4MwcQ7p0C'],
  [491233901, '4h7cWN1SvevARfXqznXqT5'], [1854231422, '2l44rj2fDZDv6sTgyYMPxL']])
for (const { source, candidates } of rows) {
  test('November 6 complete review: ' + source.name, async () => {
    const expected = fixed.get(source.id)
    const hit = pickBestMatch(source, candidates) || pickAlternateVersion(source, candidates)
    assert.equal(hit?.candidate.id, expected)
    if (!expected) return
    const candidate = candidates.find(c => c.id === expected)
    const diagnostics = {}
    const direct = await findTrackMatch(source, async () => assert.fail('unnecessary search'), diagnostics, {
      findKnownTracks: async (_, { ids, takeQuery }) => {
        assert.deepEqual(ids, [expected]); assert.ok(takeQuery()); return [candidate]
      },
    })
    assert.equal(direct?.candidate.id, expected)
    assert.equal(diagnostics.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...source, id: 0 }), [])
    for (const wrong of [
      { ...candidate, artists: [{ name: 'Unrelated Performer' }] },
      { ...candidate, name: candidate.name + ' - Instrumental' },
      { ...candidate, is_playable: false },
    ]) {
      assert.equal(pickBestMatch(source, [wrong]), null)
      assert.equal(pickAlternateVersion(source, [wrong]), null)
    }
  })
}

test('reviewed composer credit requires complete source and target cast, album and duration', () => {
  const { source, candidates } = rows.find(r => r.source.id === 1854231422)
  const correct = candidates[0]
  for (const badSource of [{ ...source, id: 0 }, { ...source, ar: source.ar.slice(0, 2) },
    { ...source, ar: [...source.ar, { name: 'Other Singer' }] }]) {
    assert.equal(pickBestMatch(badSource, [correct]), null)
  }
  for (const wrong of [
    { ...correct, name: 'モア！ジャンプ！モア！' },
    { ...correct, name: correct.name.replace('花里みのり', '別の歌手') },
    { ...correct, album: { name: 'Unrelated Album' } },
    { ...correct, duration_ms: correct.duration_ms + 10000 },
    { ...correct, artists: [{ name: 'MORE MORE JUMP!' }, { name: 'Other Singer' }] },
  ]) assert.equal(pickBestMatch(source, [wrong]), null)
  for (const solo of candidates.filter(c => c.artists[0].name === 'Nayutalien')) {
    assert.equal(pickBestMatch(source, [solo]), null)
    assert.equal(pickAlternateVersion(source, [solo]), null)
  }
})
