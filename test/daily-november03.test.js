import test from 'node:test'
import assert from 'node:assert/strict'
import { pickBestMatch, pickAlternateVersion } from '../src/matcher.js'

for (const [id, name, artist, title, credit, dt] of [
  [509106775, '彼女は旅に出る', '鎖那', 'kanojo wa tabinideru', 'sana', 220506],
  [474739593, 'カサネテク', '中村千尋', 'Kasaneteku', 'Chihiro Nakamura', 262235],
  [601536, 'ねがい', '久保田早紀', 'ねがい', 'Saki Kubota', 201706],
]) {
  test('reviewed localized recording: ' + name, () => {
    const song = { id, name, ar: [{ name: artist }], dt }
    const candidate = { id: 'recording', name: title, artists: [{ name: credit }], duration_ms: dt }
    assert.ok(pickBestMatch(song, [candidate]))
    const cover = { ...candidate, artists: [{ name: 'Other Performer' }] }
    assert.equal(pickAlternateVersion(song, [cover]), null)
    assert.equal(pickAlternateVersion({ ...song, id: 0 }, [candidate]), null)
  })
}
