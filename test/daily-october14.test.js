import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, knownTrackIds, songTitles } from '../src/matcher.js'

const song = (id, name, artists, album, dt) => ({ id, name, ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })),
  album: { name: album }, duration_ms, uri: `spotify:track:${id}`, is_playable: true })
// Saved candidates and public embed metadata; availability is simulated here.
// Account-market availability and successful playlist writes need a real run.
const yaoName = 'ありふれた世界の果てに (feat. Awich, CHICO CARLITO, ONE OK ROCK & Paledusk)'
const yaoEnglish = 'FOR OKINAWA (feat. Awich, CHICO CARLITO, ONE OK ROCK & Paledusk)'
const yaoArtists = ['YAO', 'Awich', 'CHICO CARLITO', 'ONE OK ROCK', 'Paledusk']
const cases = [
  [song(3365539045, '狗与沙发的正确用法 (Lay On My Bed With My Dog)', ['WuLinG捕鱼人'], '狗与沙发的正确用法', 153238),
    track('2dgCWtli5s6dQcnOGiQLxS', '狗与沙发的正确用法 Lay On My Bed With My Dog', ['WuLinG'], '狗与沙发的正确用法 Lay On My Bed With My Dog', 153238)],
  [song(22778715, 'Pureyes', ['伊藤由奈'], 'LOVE 〜Singles Best 2005-2010〜', 286255),
    track('0kAuRxam7qX4vvD5358BcS', 'Pureyes', ['Yuna Ito'], 'Faith / Pureyes', 287200)],
  [song(233888, '爱情讯息', ['郭静'], '下一个天亮', 280680),
    track('5IR57dAo4LK6X2pzCQ2IKY', '愛情訊息', ['Claire Kuo'], '下一個天亮', 280680)],
  [song(2063473897, '真夜中のドア～stay with me', ['松原みき'], '潮風ドライヴ～CITYPOP DRIVE～', 311933),
    track('4J2oDU9oacz7lJ7H8A8P8v', 'Mayonaka no Door~stay with me', ['Miki Matsubara'], 'Miki Matsubara Best Collection', 312293)],
  [song(3428143496, yaoName, yaoArtists, yaoName, 234782),
    track('03PGemRNLrjn9Efmy2y6OY', yaoEnglish, yaoArtists, yaoEnglish, 234782)],
  [song(2606129099, '花束のような人生を君に', ['Penthouse'], '花束のような人生を君に', 295195),
    track('2VHWC08169u82JJdPfeJgU', '花束のような人生を君に', ['Penthouse'], '花束のような人生を君に', 295120)],
  [song(3394764994, 'さよならペンギン', ['青葉市子'], 'さよならペンギン', 111096),
    track('2xJ66XR7lbKqL55J70cXqJ', 'SAYONARA PENGUIN', ['Ichiko Aoba'], 'SAYONARA PENGUIN', 111096)],
]

test('seven reviewed October 14 pairs pass strict identity and reject covers, backing tracks and unavailable recordings', () => {
  for (const [s, t] of cases) {
    assert.equal(pickBestMatch(s, [t])?.candidate.id, t.id, s.name)
    assert.equal(pickBestMatch(s, [{ ...t, is_playable: false }]), null)
    const cover = { ...t, artists: [{ name: 'Other Performer' }, ...t.artists.slice(1)] }
    assert.equal(pickBestMatch(s, [cover]), null)
    assert.equal(pickAlternateVersion(s, [cover]), null)
    const backing = { ...t, name: t.name + ' - Instrumental' }
    assert.equal(pickBestMatch(s, [backing]), null)
    assert.equal(pickAlternateVersion(s, [backing]), null)
  }
})

test('explicit bilingual single title corroborates its unbracketed album and joined artist without a global artist alias', async () => {
  const [s, t] = cases[0]
  const hit = await findTrackMatch(s, async () => [t])
  assert.equal(hit.identityEvidence, 'joined-bilingual-credit')
  assert.equal(hit.searchDiagnostics.catalogQueryCount, 1)
  for (const changes of [
    { album: { name: '狗与沙发的正确用法 Another Translation' } },
    { artists: [{ name: 'WuLinG' }, { name: 'Other' }] },
    { artists: [{ name: 'LinG' }] }, { duration_ms: s.dt + 2501 },
  ]) assert.equal(pickBestMatch(s, [{ ...t, ...changes }]), null)
  const uncorroborated = { ...s, name: '狗与沙发的正确用法' }
  assert.equal(pickBestMatch(uncorroborated, [t]), null, 'unbracketed album text alone does not prove translation')
  assert.equal(pickBestMatch({ ...s, ar: [{ name: 'WuLinG捕鱼人合唱团' }] }, [t]), null)
  const generic = song(0, '星光小屋 (Starlit House)', ['青空Seiwen'], '星光小屋', 200000)
  assert.ok(pickBestMatch(generic, [track('generic', '星光小屋 Starlit House', ['Seiwen'], '星光小屋 Starlit House', 200000)]))
})

test('new translations and pointers are guarded by source ID, complete name and primary artist', () => {
  for (const i of [3, 4, 6]) {
    const [s, t] = cases[i]
    for (const changes of [{ id: 0 }, { name: 'Other Song' }, { ar: [{ name: 'Other Artist' }] }]) {
      const changed = { ...s, ...changes }
      assert.deepEqual(knownTrackIds(changed), [])
      assert.ok(!songTitles(changed).includes(t.name))
      assert.equal(pickBestMatch(changed, [t]), null)
    }
  }
})

test('fresh playable catalog pointers resolve all seven pairs with one lookup and no search', async () => {
  for (const [s, t] of cases) {
    const diagnostics = {}
    const hit = await findTrackMatch(s, async () => assert.fail('redundant search'), diagnostics, {
      findKnownTracks: async (_s, { ids, takeQuery }) => {
        assert.deepEqual(ids, [t.id]); assert.ok(takeQuery()); return [t]
      },
    })
    assert.equal(hit?.candidate.id, t.id)
    assert.equal(diagnostics.catalogQueryCount, 1)
  }
})

test('artist-qualified free text tries both supplied bilingual titles within the two-query stage cap', async () => {
  const s = song(0, '小小银河 (A Tiny Galaxy)', ['Orbit Singer'], 'Orbit Album', 200000)
  const t = track('galaxy', 'A Tiny Galaxy', ['Orbit Singer'], 'Orbit Album', 200000)
  const d = {}
  const hit = await findTrackMatch(s, async q => q === 'A Tiny Galaxy Orbit Singer' ? [t] : [], d)
  assert.equal(hit?.candidate.id, t.id)
  assert.equal(d.stageQueryCounts['free-text'], 2)
  assert.ok(d.catalogQueryCount <= 18)
})

test('complete promotional wave suffix is metadata, while ordinary subtitles and live editions remain distinct', () => {
  const [s, t] = cases[2]
  assert.ok(pickBestMatch(s, [{ ...t, name: '愛情訊息 - 第6波', duration_ms: 279000 }]))
  assert.equal(pickBestMatch(s, [{ ...t, name: '愛情訊息 - 第6波 Live' }]), null)
  assert.equal(pickBestMatch(s, [{ ...t, name: '愛情訊息 - 第6波的故事' }]), null)
  const live = { ...t, name: '愛情訊息 (LIVE)', duration_ms: 161000 }
  assert.equal(pickBestMatch(s, [live]), null)
  assert.equal(pickAlternateVersion(s, [live])?.alternateVersion, true)
})

test('bounded fallback does not force unknown works or bypass a provider cooldown', async () => {
  const s = song(3366003199, 'いつか分かる', ['namaniental', '音街ウナ'], 'いつか分かる', 253840)
  const other = track('other', 'いつか分かる日が来る', ['Yuzi'], 'Other', 287280)
  assert.equal(pickBestMatch(s, [other]), null)
  assert.equal(pickAlternateVersion(s, [other]), null)
  assert.deepEqual(knownTrackIds(s), [])
  const [known, t] = cases[4], d = {}
  assert.equal(await findTrackMatch(known, async () => [{ ...t, is_playable: false }], d, {
    maxQueries: 4,
    findKnownTracks: async (_s, { takeQuery }) => { takeQuery(); return [{ ...t, is_playable: false }] },
  }), null)
  assert.ok(d.catalogQueryCount <= 4)
  const error = Object.assign(new Error('cooldown'), { status: 429 })
  await assert.rejects(findTrackMatch(known, async () => assert.fail('must stop'), {}, {
    findKnownTracks: async () => { throw error },
  }), e => e === error)
})
