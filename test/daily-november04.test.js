import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, knownTrackIds, pickBestMatch } from '../src/matcher.js'

const cases = [
  [3339091911, 'うそつきマカロン (feat. 重音テト)', ['暴飲暴食P', '重音テト'], 'Liar Macaron (feat. KASANE TETO)', ['暴飲暴食P', 'Kasane Teto'], '6MwKUr4sLEUZTcyvBNSTZH', 169000, 0],
  [465921195, '还是分开', ['张叶蕾'], '还是分开', ['Leafy Zhang张叶蕾'], '22IGcQVGVUac2be2vINVnm', 226791, 50],
  [666443, 'Beautiful World', ['宇多田ヒカル'], 'Beautiful World', ['Hikaru Utada'], '2JBcbbaGqUynOh01FvoV5e', 316040, 1800],
]
for (const [id, name, artists, target, credits, trackId, dt, delta] of cases) {
  test('November 4 recording lookup: ' + name, async () => {
    const song = { id, name, ar: artists.map(name => ({ name })), dt }
    const candidate = { id: trackId, name: target, artists: credits.map(name => ({ name })), duration_ms: dt + delta, is_playable: true }
    const diagnostics = {}
    const result = await findTrackMatch(song, async () => assert.fail('unexpected search'), diagnostics, {
      findKnownTracks: async (_, { ids, takeQuery }) => {
        assert.deepEqual(ids, [trackId]); assert.ok(takeQuery()); return [candidate]
      },
    })
    assert.equal(result?.candidate.id, trackId)
    assert.equal(diagnostics.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...song, id: 0 }), [])
    assert.equal(pickBestMatch(song, [{ ...candidate, artists: [{ name: 'Unrelated Performer' }] }]), null)
    assert.equal(pickBestMatch(song, [{ ...candidate, is_playable: false }]), null)
    if (credits.length > 1) assert.equal(pickBestMatch(song, [{ ...candidate, artists: candidate.artists.slice(0, 1) }]), null)
  })
}
