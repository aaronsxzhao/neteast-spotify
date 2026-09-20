import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songTitles, songSearchStages } from '../src/matcher.js'

const song = (id, name, artists, album, dt, tns = []) => ({ id, name, tns,
  ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, uri: `spotify:track:${id}`,
  artists: artists.map(name => ({ name })), album: { name: album }, duration_ms, is_playable: true })

// Catalog metadata only. These saved Sept 19/20 candidates are offline fixtures,
// not a claim of current account-market availability or a live sync result.
const muse = song(3313987952, 'ハローミューズ', ['佐藤日向', '小泉萌香'], 'Acte Zéro', 287240, ['你好缪斯'])
const museHit = track('3ZkI1059bu6ZMlKN3expbi', 'Hello Muse',
  ['星見純那(CV:佐藤日向)、大場なな(CV:小泉萌香)'], 'Acte Zero', 287240)
const rainy = song(608494, 'Rainy Night', ['露崎春女'], '13 years', 294000)
const rainyHit = track('6qjzhcpUs9Ts1iVwDUoBDz', rainy.name, ['露崎 春女/Lyrico'], '13 years', 294760)
const jun = song(28528796, '今夜、君の声が聞きたい', ['柴田淳'], 'The Early Days Selection', 419480)
const junHit = track('52gCMRhpD0V2XMMyTng3dm', '今夜、君の声が聞きたい＜Billboard Live Ver.＞',
  ['Jun Shibata'], '柴田淳 Billboard Live2013', 448688)

test('complete CV cast plus exact title, album and duration recovers Hello Muse', async () => {
  const result = await findTrackMatch(muse, async () => [museHit], {}, { allowAlternateVersions: true })
  assert.equal(result?.candidate.id, museHit.id)
  assert.equal(result.identityEvidence, 'complete-voice-cast')
  assert.equal(result.primaryMatch, true)
  // Scoped translation does not leak to another source song or main artist.
  assert.equal(pickBestMatch({ ...muse, id: 1 }, [museHit]), null)
  assert.equal(pickBestMatch({ ...muse, ar: [{ name: 'Other' }] }, [museHit]), null)
})

test('CV evidence is generic, complete-roster-only and does not merge roles', () => {
  const source = song(0, 'Song of the Stars', ['Actor A', 'Actor B'], 'Cast Album', 200000)
  const hit = track('cast', source.name, ['Role A(CV: Actor A)', 'Role B(CV：Actor B)'], 'Cast Album', 200000)
  assert.ok(pickBestMatch(source, [hit]))
  for (const changes of [
    { artists: [{ name: 'Role A(CV: Actor A)' }] },
    { artists: [{ name: 'Role A(CV: Actor A)、Role C(CV: Actor C)' }] },
    { artists: [{ name: 'Role A(CV: Actor A)、Uncredited Performer' }] },
    { album: { name: 'Other Album' } }, { duration_ms: 210000 }, { is_playable: false },
  ]) assert.equal(pickBestMatch(source, [{ ...hit, ...changes }]), null, JSON.stringify(changes))
  assert.equal(pickBestMatch({ ...source, ar: [{ name: 'Role X(CV: Actor A)' }] },
    [track('other-role', source.name, ['Role Y(CV: Actor A)'], source.al.name, source.dt)]), null)
  assert.equal(pickBestMatch(muse, [{ ...museHit, name: 'Hello Muse - Instrumental' }]), null)
  assert.equal(pickAlternateVersion(muse, [{ ...museHit, name: 'Hello Muse - Instrumental' }]), null)
})

test('bilingual slash credit recovers Rainy Night in one query without a global slash alias', async () => {
  let calls = 0
  const hit = await findTrackMatch(rainy, async () => { calls++; return [rainyHit] })
  assert.equal(hit?.candidate.id, rainyHit.id)
  assert.equal(hit.identityEvidence, 'bilingual-display-credit')
  assert.equal(calls, 1)
  for (const changes of [{ album: { name: 'Other Album' } }, { duration_ms: 310000 },
    { artists: [{ name: 'Other' }, ...rainyHit.artists] }, { is_playable: false }]) {
    assert.equal(pickBestMatch(rainy, [{ ...rainyHit, ...changes }]), null)
  }
  const ac = song(0, 'Song', ['AC'], 'Album', 200000)
  assert.equal(pickBestMatch(ac, [track('band', ac.name, ['AC/DC'], 'Album', 200000)]), null)
})

test('angle-bracket live suffix and verified Jun Shibata identity enable the permitted alternate', async () => {
  assert.equal(pickBestMatch(jun, [junHit]), null, 'a live version is not the original recording')
  const match = await findTrackMatch(jun, async () => [junHit], {}, { allowAlternateVersions: true })
  assert.equal(match?.candidate.id, junHit.id)
  assert.equal(match.alternateVersion, true)
  assert.ok(match.searchDiagnostics.catalogQueryCount <= 5)
  assert.equal(match.searchDiagnostics.stageQueryCounts['manual-alias'], undefined)
  assert.equal(await findTrackMatch(jun, async () => [junHit], {}, { allowAlternateVersions: false }), null)
  for (const brackets of [['<', '>'], ['＜', '＞'], ['〈', '〉'], ['《', '》']]) {
    const name = `${jun.name}${brackets[0]}Billboard Live Ver.${brackets[1]}`
    assert.ok(pickAlternateVersion(jun, [{ ...junHit, name }]))
    assert.equal(pickAlternateVersion(jun, [{ ...junHit, name: `${jun.name}${brackets[0]}Another Story${brackets[1]}` }]), null)
  }
})

test('same artist aliases work for new songs and either language direction, not only the reported IDs', () => {
  for (const [a, b] of [['柴田淳', 'Jun Shibata'], ['青山テルマ', 'Thelma Aoyama'],
    ['岩崎太整', 'Taisei Iwasaki'], ['八神純子', 'Junko Yagami'], ['邓丽君', 'Teresa Teng'], ['沈圭善', 'Lucia'],
    ['HYOLYN', '孝琳'], ['효린', '孝琳'], ['SOYOU', '소유'], ['昭宥', '소유']]) {
    for (const [sourceName, targetName] of [[a, b], [b, a]]) {
      const source = song(0, 'New Song', [sourceName], 'Album', 200000)
      assert.ok(pickBestMatch(source, [track('new-song', source.name, [targetName], 'Album', 200000)]), `${sourceName} -> ${targetName}`)
    }
  }
})

test('Thelma primary identity recovers the exact FIRST TAKE but does not weaken guest-only rejection', async () => {
  const source = song(3354523725, 'そばにいるね - From THE FIRST TAKE', ['青山テルマ', 'SoulJa'], 'そばにいるね - From THE FIRST TAKE', 301940)
  const hit = track('0GePS4XP9PHaJT7uHiHhje', source.name, ['Thelma Aoyama', 'SoulJa'], source.al.name, source.dt)
  const match = await findTrackMatch(source, async () => [hit])
  assert.equal(match?.candidate.id, hit.id)
  assert.equal(match.searchDiagnostics.catalogQueryCount, 1)
  assert.equal(pickBestMatch(source, [{ ...hit, artists: [{ name: 'Unrelated' }, { name: 'SoulJa' }] }]), null)
})

test('On My Own resolves the composer identity despite a compilation title difference', () => {
  const source = song(1311002330, 'On My Own', ['岩崎太整', '二宮愛'], 'Blood Blockade Battlefront (Original Series Sountrack)', 271586)
  const hit = track('5t4Bbl3XZNo8FtKr8N3DmO', source.name, ['Taisei Iwasaki'], 'TVアニメ「血界戦線」オリジナル・サウンドトラック', 271586)
  assert.equal(pickBestMatch(source, [hit])?.candidate.id, hit.id)
})

test('Junko Yagami remaster wins over a shared-guest release', () => {
  const source = song(22824897, 'カシミヤのほほえみ', ['八神純子'], 'GOLDEN BEST', 270933)
  const wrong = track('1oBOWebF7IpJownc0F6JBQ', source.name, ['CosmicFM', 'Junko Yagami'], 'Summer Girls', 271384)
  const hit = track('4xFNjuGmscB1pmnCol3uYm', source.name + ' - 2020 Remaster', ['Junko Yagami'], 'MOON YEARS (2020 Remaster)', 271426)
  assert.equal(pickBestMatch(source, [wrong, hit])?.candidate.id, hit.id)
  assert.equal(pickBestMatch(source, [wrong]), null)
})

test('verified Teresa identity excludes covers and permits closest same-artist alternative', () => {
  const source = song(225798, '别离的预感(日)', ['邓丽君'], '花样年华', 269600, ['别れの予感'])
  const a = track('3ZmAIbtf72QymMSbCs0KRS', '別れの予感', ['Teresa Teng'], 'Compilation', 267346)
  const b = track('6MNhJdVQBCETGefhnuGPrd', '別れの予感', ['Teresa Teng'], '鄧麗君東洋金曲賞5', 269741)
  const wrong = track('00T1qVvpPNDxGsdunwBUOI', '別れの予感', ['Akina Nakamori'], 'ZERO album～歌姫2～', 268506)
  assert.equal(pickBestMatch(source, [wrong]), null)
  assert.equal(pickAlternateVersion(source, [a, wrong, b])?.candidate.id, b.id)
})

test('verified translated titles are actually searched in the bounded fallback, with source guards', async () => {
  for (const [source, title, artist] of [
    [song(2099327170, '여름에 두었다', ['SHAUN'], '여름에 두었다', 212506, ['留在夏天']), 'That Summer', 'SHAUN'],
    [song(36307466, '달과 6펜스', ['沈圭善'], 'Light & Shade Chapter.2', 246449, ['月亮与六便士']), 'The Moon and Sixpence', 'Lucia'],
  ]) {
    const calls = []
    const hit = track('translated', title, [artist], source.al.name, source.dt)
    const match = await findTrackMatch(source, async q => { calls.push(q); return q.includes(title) ? [hit] : [] }, {}, { allowAlternateVersions: true })
    assert.equal(match?.candidate.id, hit.id)
    assert.ok(calls.length <= 18)
    assert.ok(songSearchStages(source).find(s => s.manual).queries[0].includes(title))
    assert.ok(!songTitles({ ...source, id: -1 }).includes(title))
    assert.ok(!songTitles({ ...source, ar: [{ name: 'Unrelated' }] }).includes(title))
    assert.equal(pickBestMatch(source, [{ ...hit, artists: [{ name: 'Unrelated' }] }]), null)
  }
})

test('new IDs for equally weak same-title covers do not count as fresh identity evidence', async () => {
  const source = song(0, 'Distinct Song', ['Original Singer'], 'Original Album', 200000, ['Two', 'Three', 'Four'])
  let n = 0
  const d = {}
  await findTrackMatch(source, async () => [track(String(++n), source.name, ['Other'], 'Other Album', 200000)], d)
  assert.equal(d.queryTrace[0].newEvidence, true)
  assert.ok(d.queryTrace.slice(1).every(q => !q.newEvidence))
  assert.equal(d.identityReviewRequired, true)
  assert.equal(d.stageQueryCounts['budget-recovery'], undefined)
  assert.ok(d.reviewReasons.includes('identity-review-required'))
  assert.ok(d.candidateCount > 1, 'retain all rivals even when they do not improve identity')
})

test('unverified Richz prefix and conflicting distributor credits stay reviewable, never auto-aliased', async () => {
  for (const [source, candidate] of [
    [song(3362038053, 'Fever Pitch', ['Richz'], 'Fever Pitch', 135483), track('richz', 'Fever Pitch', ['DJ Richz'], 'Fever Pitch', 135483)],
    [song(3339873072, '误闯', ['许斐'], '落日余温', 202384), track('wy', '误闯', ['Wy'], '误闯', 202384)],
    [song(3396667536, 'you know 2(Phonk)', ['Trispect', 'Kyrex'], 'you know 2(Phonk)', 126056), track('dj', 'you know 2 - phonk', ['DJchina'], 'you know 2 (phonk)', 126124)],
    [song(3397369954, 'Besame', ['音权'], 'Besame', 91437), track('besame', 'Besame', ['DonixFloW'], 'atras de dinero', 91167)],
  ]) {
    const d = {}
    assert.equal(await findTrackMatch(source, async () => [candidate], d, { allowAlternateVersions: true }), null)
    assert.equal(d.identityReviewRequired, true)
    assert.ok(d.stoppedStages.some(s => s.reason === 'identity-review-required'))
    assert.ok(d.catalogQueryCount < 18)
  }
})

test('identity-review cutoff still lets dedicated metadata, album and verified alias strategies recover', async () => {
  const source = song(2099327170, '여름에 두었다', ['SHAUN'], '여름에 두었다', 212506, ['留在夏天'])
  const wrong = track('wrong', source.name, ['Other'], 'Other Album', source.dt)
  const hit = track('right', 'That Summer', ['SHAUN'], 'That Summer', source.dt)
  const d = {}
  const match = await findTrackMatch(source, async q => q.includes('That Summer') ? [hit] : [wrong], d, { allowAlternateVersions: true })
  assert.equal(match?.candidate.id, hit.id)
  assert.equal(d.identityReviewRequired, false)
})
