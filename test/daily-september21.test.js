import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songTitles, searchableArtists, knownTrackIds } from '../src/matcher.js'

const song = (id, name, artists, album, dt, tns = []) => ({ id, name, tns,
  ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, uri: `spotify:track:${id}`,
  artists: artists.map(name => ({ name })), album: { name: album }, duration_ms, is_playable: true })

// Saved candidate metadata and reviewed public pointers, not live availability.
const tibibi = song(2737954964, 'I OWN,I KNOW（我知·我控）', ['田冰冰TIBIBI'], 'I OWN I KNOW(我知·我控）', 184032)
const tibibiHit = track('1S8ctHnta2bWKbQcbnV0HW', 'I OWN I KNOW', ['TIBIBI'], 'I OWN I KNOW', 184000)
const tale = song(3313987317, '昔語りふたりぼっち', ['生田輝', '伊藤彩沙'], 'Acte Zéro', 277333)
const taleHit = track('7H4ybl0Xjn5EMHDZdoUG7M', 'Our Old Tale', ['石動双葉(CV:生田輝)、花柳香子(CV:伊藤彩沙)'], 'Acte Zero', 277333)

test('joined bilingual credits require corroborating recording evidence, not global substring aliases', async () => {
  const d = {}
  const result = await findTrackMatch(tibibi, async () => [tibibiHit], d)
  assert.equal(result?.candidate.id, tibibiHit.id)
  assert.equal(result.identityEvidence, 'joined-bilingual-credit')
  assert.equal(d.catalogQueryCount, 1)
  assert.ok(searchableArtists(tibibi).includes('TIBIBI'))
  assert.ok(!searchableArtists(tibibi, { identity: true }).includes('TIBIBI'))
  for (const changes of [
    { album: { name: 'Other Album' } }, { duration_ms: 190000 }, { is_playable: false },
    { artists: [{ name: 'BIBI' }] }, { artists: [{ name: 'Other' }, { name: 'TIBIBI' }] },
    { name: 'I OWN I KNOW - Instrumental' },
  ]) assert.equal(pickBestMatch(tibibi, [{ ...tibibiHit, ...changes }]), null, JSON.stringify(changes))
  assert.equal(pickAlternateVersion(tibibi, [{ ...tibibiHit, duration_ms: 210000 }]), null)
  assert.equal(pickBestMatch({ ...tibibi, ar: [...tibibi.ar, { name: 'Guest' }] }, [tibibiHit]), null)
})

test('joined bilingual corroboration works for new names and both directions, never mixed-script bands', () => {
  for (const [a, b] of [['青空Seiwen', 'Seiwen'], ['Seiwen', '青空Seiwen'], ['Seiwen青空', 'Seiwen']]) {
    const s = song(1, 'A Special Song', [a], 'A Special Album', 200000)
    assert.equal(pickBestMatch(s, [track('t', s.name, [b], s.al.name, s.dt)])?.identityEvidence, 'joined-bilingual-credit')
  }
  for (const a of ['青空&Seiwen', '青空/Seiwen', '青空Seiwen合唱团', '青空AB']) {
    const s = song(1, 'A Special Song', [a], 'A Special Album', 200000)
    assert.equal(pickBestMatch(s, [track('t', s.name, ['Seiwen'], s.al.name, s.dt)]), null, a)
  }
})

test('version-only aliases do not become song titles or consume title searches', () => {
  const s = song(1436081452, '爱要怎么说出口', ['澪恩Seiwen'], '爱要怎么说出口', 191832,
    ['女声版', '女生版', '伴奏', 'Live Version', 'Another Genuine Title'])
  assert.deepEqual(songTitles(s), [s.name, 'Another Genuine Title'])
  assert.ok(searchableArtists(s).includes('Seiwen'))
  assert.ok(songTitles({ ...s, name: '女声版' }).includes('女声版'), 'never discard the actual song name')
})

test('scoped Our Old Tale translation requires full CV cast and excludes the instrumental', () => {
  assert.equal(pickBestMatch(tale, [taleHit])?.identityEvidence, 'complete-voice-cast')
  assert.equal(pickBestMatch({ ...tale, id: 123 }, [taleHit]), null)
  assert.equal(pickBestMatch({ ...tale, ar: [{ name: '生田輝' }] }, [taleHit]), null)
  assert.equal(pickBestMatch(tale, [{ ...taleHit, name: 'Our Old Tale - Instrumental' }]), null)
  assert.equal(pickAlternateVersion(tale, [{ ...taleHit, name: 'Our Old Tale - Instrumental' }]), null)
})

test('reviewed catalog pointer and translation can validate in one request, with normal rejection gates', async () => {
  let searches = 0
  const result = await findTrackMatch(tale, async () => { searches++; return [] }, {}, {
    findKnownTracks: async (_s, { ids, takeQuery }) => {
      assert.deepEqual(ids, [taleHit.id]); assert.ok(takeQuery()); return [taleHit]
    },
  })
  assert.equal(result?.candidate.id, taleHit.id)
  assert.equal(result.searchStage, 'known-track')
  assert.equal(searches, 0)
  assert.deepEqual(knownTrackIds({ ...tale, name: 'Other Song' }), [])
  assert.equal(await findTrackMatch(tale, async () => [], {}, {
    findKnownTracks: async (_s, { takeQuery }) => { takeQuery(); return [{ ...taleHit, is_playable: false }] },
  }), null)
})

test('Miki Imai credit resolves existing recordings but excludes same-title karaoke and covers', async () => {
  const s = song(569028, 'PIECE OF MY WISH', ['今井美樹'], 'PIECE OF MY WISH', 340466)
  const a = track('4RiyKnybYpfzeAJ2LuuUYe', s.name + ' - 2026 Remaster', ['Miki Imai'], s.al.name, 337587)
  const b = track('5J6POaDAhQz14pulwUH8ip', s.name, ['mikiimai'], 'Ivory II', 337853)
  const wrong = track('karaoke', s.name, ['歌っちゃ王'], s.al.name, s.dt)
  const hit = await findTrackMatch(s, async () => [wrong, a, b], {}, { allowAlternateVersions: true })
  assert.ok([a.id, b.id].includes(hit?.candidate.id))
  assert.equal(pickBestMatch(s, [wrong]), null)
  assert.equal(pickAlternateVersion(s, [wrong]), null)
})

test('Yorukaze translation and Miho Karasawa credit cannot leak to unrelated songs or artists', () => {
  const y = song(759622, 'よる☆かぜ', ['ケツメイシ'], 'よる☆かぜ', 348266)
  const hit = track('2b3bDmj7kUKXtkYSaJdPmZ', 'yorukaze', ['ケツメイシ'], 'ケツの嵐 ～夏BEST～', 346000)
  assert.ok(pickBestMatch(y, [hit]))
  assert.equal(pickBestMatch({ ...y, id: 0 }, [hit]), null)
  const m = song(26123720, '無人の島', ['TRUE'], 'anytime,anywhere', 362080)
  const mh = track('02OjX2aaE5EAyveeluFR2B', m.name, ['Miho Karasawa'], m.al.name, m.dt)
  assert.ok(pickBestMatch(m, [mh]))
  assert.equal(pickBestMatch({ ...m, id: 0 }, [mh]), null)
  assert.deepEqual(knownTrackIds({ ...m, ar: [{ name: 'Other' }] }), [])
  assert.equal(pickBestMatch(m, [{ ...mh, artists: [{ name: 'Other' }] }]), null)
})

test('final recovery has one stagnation allowance, while every dedicated search strategy still runs', async () => {
  const s = song(0, 'Long Song Name', ['Original'], 'Original Album', 200000, ['另一个名字', 'Third Name'])
  const wrong = track('wrong', s.name, ['Other Singer'], 'Another Album', 250000)
  const d = {}
  assert.equal(await findTrackMatch(s, async () => [wrong], d, { allowAlternateVersions: true }), null)
  assert.ok(d.stageQueryCounts.metadata)
  assert.ok(d.stageQueryCounts['title-only'])
  assert.ok(d.stageQueryCounts['manual-alias'])
  assert.ok(d.stageQueryCounts['second-pass'])
  assert.ok((d.stageQueryCounts['budget-recovery'] || 0) <= 2)
  assert.ok(d.catalogQueryCount <= 18)
  assert.equal(new Set(d.queryTrace.map(q => q.query)).size, d.queryTrace.length)
  assert.ok(d.stoppedStages.some(s => s.reason === 'no-new-evidence'))
})
