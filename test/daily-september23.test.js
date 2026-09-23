import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, titleVariants, songSearchStages, knownTrackIds } from '../src/matcher.js'

const song = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const track = (id, name, artist, album, duration_ms) => ({ id, name, uri: `spotify:track:${id}`,
  artists: [{ name: artist }], album: { name: album }, duration_ms, is_playable: true })

// Saved September 23 metadata. Mocked retrieval is not a live availability test.
const oh = song(22663877, 'OH NO,OH YES!', '中森明菜', 'CRIMSON', 287533)
const ohHits = [
  track('3azWTe7wgJhQkC5B11mepk', oh.name, 'Akina Nakamori', 'CRIMSON', 287533),
  track('2hGPfCRMjK2haWM6ja11XP', oh.name + ' - 2012 Remaster', 'Akina Nakamori', 'CRIMSON (2012 Remaster)', 287586),
  track('3VkXmq1QVmTwDzxp3tMcuq', oh.name, 'Akina Nakamori', 'AKINA BOX', 287533),
]
const kiss = song(22685913, 'Kissしたい -WANNA KISS- (2021 Remaster)', '当山ひとみ', 'SEXY ROBOT (2021 Remaster)', 270146)
const kissHits = [
  track('7rz71t9mmV30YrTqM0ZNRy', 'Wanna Kiss - 2021 Remaster', 'Hitomi Tohyama', 'Sexy Robot (2021 Remaster)', 270146),
  track('5LXQeJX8ZGS7Q5ZZ3vtGF7', 'Wanna Kiss', 'Hitomi Tohyama', 'Ritual Chants', 270560),
]

test('verified identities and source-aligned reissues resolve September 23 saved pools early', async () => {
  for (const [s, pool] of [[oh, ohHits], [kiss, kissHits]]) {
    assert.equal(pickBestMatch(s, pool)?.candidate.id, pool[0].id)
    let calls = 0
    const result = await findTrackMatch(s, async () => { calls++; return pool }, {}, { allowAlternateVersions: true })
    assert.equal(result?.candidate.id, pool[0].id)
    assert.equal(calls, 1)
    assert.equal(pickBestMatch(s, pool.map(c => ({ ...c, artists: [{ name: 'Unrelated Singer' }] }))), null)
    assert.equal(pickBestMatch(s, pool.map(c => ({ ...c, is_playable: false }))), null)
  }
})

test('closed cross-script dash titles supply both names to early searches, never a global translation', () => {
  assert.ok(titleVariants(kiss.name).includes('WANNA KISS'))
  assert.ok(titleVariants(kiss.name).includes('Kissしたい'))
  assert.ok(songSearchStages(kiss)[0].queries.slice(0, 3).some(q => q.includes('track:"WANNA KISS"')))
  for (const name of ['新しい歌 -NEW SONG-', '新しい歌 —NEW SONG— (2021 Remaster)', '새로운 노래 -New Song-']) {
    assert.ok(titleVariants(name).some(n => n.toLowerCase() === 'new song'), name)
  }
  for (const name of ['New Song -Another Story-', '新しい歌 -Live-', '新しい歌 -club mix-', '新しい歌 -New Song', '新しい歌 -New Song—', '新しい歌 -New Песня-']) {
    assert.deepEqual(titleVariants(name), [name], name)
  }
  const unrelated = song(0, 'Other Song', '楽団 -Other Band-', 'Album', 200000)
  assert.equal(pickAlternateVersion(unrelated, [track('x', 'Other Song', 'Other Band', 'Album', 200000)]), null)
})

test('source-album preference does not erase uncertain, vocal or guest differences', () => {
  const live = { ...ohHits[0], id: 'live', name: oh.name + ' (Live)' }
  assert.equal(pickBestMatch(oh, [live]), null)
  assert.equal(pickBestMatch(oh, [{ ...ohHits[0], artists: [{ name: 'Mariya Takeuchi' }, { name: 'Akina Nakamori' }] }]), null)
  const rival = { ...ohHits[1], album: ohHits[0].album }
  assert.equal(pickBestMatch(oh, [ohHits[0], rival]), null, 'equal album evidence remains ambiguous')
  assert.equal(pickBestMatch({ ...oh, ar: [{ name: 'Unknown Artist' }] }, ohHits), null)
})

test('same-artist vocal mixes can substitute but instrument mix cannot', async () => {
  const s = song(630248, 'Sexy dandy', '中原めいこ', 'mint', 268240)
  const backing = track('272Ks94MnyLJy13OnO1c8x', 'Sexy dandy - instrument mix', 'Meiko Nakahara', 'HIGH ENERGY -remixed in N.Y.-', 268466)
  const vocal = track('7qreTXsf5RrIRSxvRTwRJR', 'Sexy dandy - after hours mix', 'Meiko Nakahara', backing.album.name, 285600)
  assert.equal(pickBestMatch(s, [backing, vocal]), null)
  assert.equal(pickAlternateVersion(s, [backing]), null)
  assert.equal(pickAlternateVersion(s, [backing, vocal])?.candidate.id, vocal.id)
  let calls = 0
  const result = await findTrackMatch(s, async () => { calls++; return [backing, vocal] }, {}, { allowAlternateVersions: true })
  assert.equal(result?.candidate.id, vocal.id)
  assert.equal(result.alternateVersion, true)
  assert.ok(calls <= 5)
  assert.equal(pickAlternateVersion(s, [{ ...vocal, artists: [{ name: 'Other Singer' }] }]), null)
  for (const name of ['Sexy dandy - My Life Is a Mix', 'Sexy dandy (A Story About Mix)']) {
    assert.equal(pickAlternateVersion(s, [{ ...vocal, name }]), null)
  }
  for (const label of ['after hours mix', 'club mix', 'instrument mix']) {
    for (const [open, close] of [['(', ')'], ['[', ']'], ['【', '】'], ['<', '>'], ['〈', '〉'], ['《', '》']]) {
      const c = { ...vocal, name: `Sexy dandy ${open}${label}${close}`, duration_ms: s.dt }
      assert.equal(pickBestMatch(s, [c]), null, c.name)
      assert.equal(Boolean(pickAlternateVersion(s, [c])), label !== 'instrument mix', c.name)
      assert.ok(pickBestMatch({ ...s, name: c.name }, [c]))
    }
  }
})

test('Cagnet catalog pointer stays scoped and must pass fresh availability and identity checks', async () => {
  const s = song(22655497, 'Deeper and Deeper', 'CAGNET', 'Here We Are Again', 288925)
  const id = '5ElzKkLs6ZQ1Sp2YEkzHm9'
  const c = track(id, s.name, 'Cagnet', s.al.name, 288925)
  assert.deepEqual(knownTrackIds(s), [id])
  assert.deepEqual(knownTrackIds({ ...s, id: 0 }), [])
  assert.deepEqual(knownTrackIds({ ...s, name: 'Different Song' }), [])
  assert.deepEqual(knownTrackIds({ ...s, ar: [{ name: 'Madonna' }] }), [])
  let searches = 0
  const result = await findTrackMatch(s, async () => { searches++; return [] }, {}, {
    findKnownTracks: async (_, { takeQuery }) => { assert.ok(takeQuery()); return [c] },
  })
  assert.equal(result?.candidate.id, id)
  assert.equal(searches, 0)
  assert.equal(result.searchDiagnostics.catalogQueryCount, 1)
  for (const bad of [{ ...c, is_playable: false }, { ...c, artists: [{ name: 'Madonna' }] }]) {
    assert.equal(await findTrackMatch(s, async () => [], {}, {
      allowAlternateVersions: true,
      findKnownTracks: async (_, { takeQuery }) => { takeQuery(); return [bad] },
    }), null)
  }
})
