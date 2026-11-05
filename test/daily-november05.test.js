import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, knownTrackIds, pickBestMatch, pickAlternateVersion } from '../src/matcher.js'

// Nov 5 persisted diagnostics, plus the public Galaxy embed metadata.
const cases = [
  [2614851804, '秋风', ['徐化文（四熹丸子）'], 200955, '秋风', ['四熹丸子'], 200955, '7ue8efKMQnnr9f4FeEJnl4'],
  [28798391, '우리 얘기 좀 해', ['Lillo', '제이형', '지현'], 230063, 'Can we just talk?', ['Lillo', 'J-Hyung', '엄지현'], 230001, '6dYwVgEs2zyCZJgtzBXT91'],
  [427595456, '우주를 줄게', ['脸红的思春期'], 215120, 'Galaxy', ['BOL4'], 213853, '15c7KZTrsCUxCQcOdUVELc'],
]

for (const [id, name, artists, dt, title, credits, duration, trackId] of cases) {
  test('November 5 bounded recording recovery: ' + name, async () => {
    const song = { id, name, ar: artists.map(name => ({ name })), dt }
    const candidate = { id: trackId, name: title, artists: credits.map(name => ({ name })), duration_ms: duration, is_playable: true }
    const diagnostics = {}
    const hit = await findTrackMatch(song, async () => assert.fail('unexpected search'), diagnostics, {
      findKnownTracks: async (_, { ids, takeQuery }) => {
        assert.deepEqual(ids, [trackId])
        assert.ok(takeQuery())
        return [candidate]
      },
    })
    assert.equal(hit?.candidate.id, trackId)
    assert.equal(diagnostics.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...song, id: 0 }), [])
    assert.deepEqual(knownTrackIds({ ...song, name: 'Different Song' }), [])
    for (const wrong of [
      { ...candidate, artists: [{ name: 'Unrelated Performer' }, ...candidate.artists] },
      { ...candidate, name: title + ' - Instrumental Karaoke Version' },
      { ...candidate, name: title + ' - Japanese Version' },
      { ...candidate, is_playable: false },
    ]) {
      assert.equal(pickBestMatch(song, [wrong]), null)
      assert.equal(pickAlternateVersion(song, [wrong]), null)
    }
    assert.equal(pickBestMatch({ ...song, id: 0 }, [candidate]), null)
  })
}
