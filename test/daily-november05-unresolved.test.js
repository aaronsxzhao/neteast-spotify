import test from 'node:test'
import assert from 'node:assert/strict'
import { pickBestMatch, pickAlternateVersion } from '../src/matcher.js'

// Real rejected previews from the November 5 review. Similar duration, a
// shared title or a matching year must not establish recording identity.
const cases = [
  [29539330, 'Sincerely', '浜田朱里', '瞳・センチメンタル', 216133,
    '7lWPgRBsxgkZ57GRqxXYZe', 'sincerely,', 'Yuri Kil', 'sincerely,', 220583],
  [28718974, '別れ1940', '深津絵里', '毒苺', 181000,
    '6QE2Kz7xgASZVwlakVQhWx', '雨がやんだら', 'Yukiji Asaoka', '別れのスナック', 184240],
  [433757, '新宿午前3时25分', '北野武', 'GOLDEN☆BEST', 301000,
    '4WH0cjS1ZRimYnzTslti8J', '新宿午前四時', 'Goro Noguchi', 'GORO IN LOS ANGELES,U.S.A. -北回帰線-', 272373],
  [1427664751, '一枚の写真', '石田ひかり', 'White Virgin', 268506,
    '4HippgEUQqQlzafF3oQCx9', '一枚の写真', 'QWAI', '約束', 255853],
]

for (const [id, name, artist, album, dt, targetId, title, credit, targetAlbum, duration] of cases) {
  test('November 5 unresolved source rejects unrelated recording: ' + name, () => {
    const song = { id, name, ar: [{ name: artist }], al: { name: album }, dt }
    const wrong = { id: targetId, name: title, artists: [{ name: credit }], album: { name: targetAlbum }, duration_ms: duration, is_playable: true }
    assert.equal(pickBestMatch(song, [wrong]), null)
    assert.equal(pickAlternateVersion(song, [wrong]), null)
  })
}
