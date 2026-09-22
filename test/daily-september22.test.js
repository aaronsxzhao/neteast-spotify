import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songTitles, songSearchStages } from '../src/matcher.js'

const song = (id, name, artists, album, dt, tns = []) => ({ id, name, tns,
  ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, uri: `spotify:track:${id}`,
  artists: artists.map(name => ({ name })), album: { name: album }, duration_ms, is_playable: true })

// Saved September 22 candidate metadata; no live provider requests or credentials.
const nice = song(28738294, 'Nice Body (With 로꼬)', ['孝敏', 'Loco'], 'Make Up', 208548, ['Nice Body (With Loco)'])
const niceHit = track('3ZgtlsZUjiePqosB19amzf', 'Nice Body (With Loco)', ['Hyomin'], 'Make Up', 208548)
const eyes = song(423365, '瞳をとじて', ['平井堅'], '瞳をとじて', 340079)
const eyeHits = [
  track('2hxE4LWxgTLgPmDvBWxtPd', eyes.name, ['Ken Hirai'], 'SENTIMENTALovers', 341240),
  track('0HNjbkU16hrxLhMEm3MD0C', eyes.name, ['Ken Hirai'], 'Utabaka', 341746),
  track('4eHZuD1NdSSwtJCgGk7YLd', eyes.name, ['Ken Hirai'], 'Hitomiotojite', 340026),
]

test('Nice Body handles agreed bilingual guest suffixes even when one catalog omits the structured guest', async () => {
  let requests = 0
  const hit = await findTrackMatch(nice, async () => { requests++; return [niceHit] })
  assert.equal(hit?.candidate.id, niceHit.id)
  assert.equal(hit.primaryMatch, true)
  assert.equal(requests, 1)
  assert.ok(pickBestMatch({ ...nice, tns: [] }, [niceHit]), 'Korean Loco credit also agrees without a translated title')
  assert.equal(pickBestMatch(nice, [{ ...niceHit, artists: [{ name: 'Other Singer' }] }]), null)
  assert.equal(pickAlternateVersion(nice, [{ ...niceHit, artists: [{ name: 'Other Singer' }] }]), null)
})

test('suffix agreement is generic and ordinary uncorroborated with subtitles remain significant', () => {
  const s = song(0, 'New Song (With Guest)', ['Lead', 'Guest'], 'Album', 200000)
  const c = track('c', 'New Song (with Guest)', ['Lead'], 'Album', 200000)
  assert.ok(pickBestMatch(s, [c]))
  assert.ok(pickAlternateVersion({ ...s, dt: 240000 }, [c]))
  assert.equal(pickAlternateVersion(song(0, 'New Song', ['Lead'], 'Album', 200000), [c]), null)
  assert.equal(pickAlternateVersion(s, [{ ...c, name: 'New Song (with Someone Else)' }]), null)
  assert.equal(pickAlternateVersion({ ...s, ar: [{ name: 'Other' }, { name: 'Guest' }] }, [c]), null)
})

test('Ken Hirai originals beat covers and less-vocal editions, choosing the closest equal-score reissue', async () => {
  const backing = track('backing', eyes.name + ' (less vocal)', ['Ken Hirai'], eyes.al.name, eyes.dt)
  const cover = track('cover', eyes.name, ['BENI'], eyes.al.name, eyes.dt)
  const pool = [backing, cover, ...eyeHits]
  assert.equal(pickBestMatch(eyes, pool)?.candidate.id, eyeHits[2].id)
  assert.equal(pickBestMatch(eyes, [cover]), null)
  assert.equal(pickBestMatch(eyes, [backing]), null)
  assert.equal(pickAlternateVersion(eyes, [backing, cover]), null)
  let requests = 0
  const result = await findTrackMatch(eyes, async () => { requests++; return pool }, {}, { allowAlternateVersions: true })
  assert.equal(result?.candidate.id, eyeHits[2].id)
  assert.equal(requests, 1)
})

test('backing-track labels cannot replace vocals even in same-artist alternate mode', () => {
  const s = song(0, 'Original Song', ['Singer'], 'Album', 200000)
  for (const label of ['less vocal', 'off vocal', 'off-vocals', 'Instrumental', 'Karaoke', '伴奏', 'ボーカルレス']) {
    const c = track('c', `Original Song (${label})`, ['Singer'], 'Album', 200000)
    assert.equal(pickBestMatch(s, [c]), null, label)
    assert.equal(pickAlternateVersion(s, [c]), null, label)
    assert.ok(pickBestMatch({ ...s, name: c.name }, [c]), 'actual instrumental source still works')
  }
  assert.ok(pickAlternateVersion(s, [track('live', 'Original Song (Live)', ['Singer'], 'Live Album', 240000)]))
})

test('WANDS tilde edition typo reaches same-primary alternate, never the guest-only original', async () => {
  const s = song(22763956, '世界中の誰よりきっと ～Album Verion～', ['WANDS'], 'SINGLES COLLECTION+6', 266693)
  const c = track('7vvdk7B2gYiwyyeTNxq9QV', '世界中の誰よりきっと [WANDS 第5期ver.]', ['WANDS'], 'BURN THE SECRET', 240546)
  const guest = track('guest', '世界中の誰よりきっと', ['中山美穂', 'WANDS'], 'COLLECTION Ⅲ', 247213)
  assert.equal(pickBestMatch(s, [c]), null, '26-second difference is not the identical recording')
  assert.equal(pickAlternateVersion(s, [guest]), null)
  const result = await findTrackMatch(s, async () => [guest, c], {}, { allowAlternateVersions: true })
  assert.equal(result?.candidate.id, c.id)
  assert.equal(result.alternateVersion, true)
  assert.ok(result.searchDiagnostics.catalogQueryCount <= 5)
})

test('only complete edition labels are removed from tildes, including fullwidth and the bounded typo', () => {
  const s = song(0, 'Song', ['Singer'], 'Album', 200000)
  const c = track('c', 'Song', ['Singer'], 'Album', 200000)
  for (const label of ['~Album Version~', '～Album Verion～', '〜Single Ver.〜', '~Studio Version~']) {
    assert.ok(pickBestMatch({ ...s, name: `Song ${label}` }, [c]), label)
  }
  for (const label of ['~Another Story~', '~Album Journey~', '~Album Verion', '~My Version of Love~']) {
    assert.equal(pickAlternateVersion({ ...s, name: `Song ${label}` }, [c]), null, label)
  }
})

test('verified translations are source-scoped, searchable within budget and still require matching artists', async () => {
  for (const [s, title] of [
    [song(1442021148, '東京フラッシュ', ['Vaundy'], 'Tokyo Flash', 258857), 'Tokyo Flash'],
    [song(1416378346, '아무노래', ['Zico'], '아무노래', 227226), 'Any song'],
    [song(22842404, 'TV를 껐네...', ['Leessang', '尹美莱', '权正烈'], 'AsuRaBalBalTa', 215986), 'I turned off the TV...'],
  ]) {
    const c = track('translated', title, [s.ar[0].name], s.al.name, s.dt)
    const d = {}, calls = []
    const hit = await findTrackMatch(s, async q => { calls.push(q); return q.includes(`track:"${title}"`) ? [c] : [] }, d)
    assert.equal(hit?.candidate.id, c.id, title)
    assert.ok(d.catalogQueryCount <= 18)
    assert.equal(new Set(calls).size, calls.length)
    assert.ok(songSearchStages(s).find(x => x.manual).queries[0].includes(title))
    assert.ok(!songTitles({ ...s, id: -1 }).includes(title))
    assert.ok(!songTitles({ ...s, ar: [{ name: 'Wrong Artist' }] }).includes(title))
    assert.equal(pickBestMatch(s, [{ ...c, artists: [{ name: 'Wrong Artist' }] }]), null)
  }
})

test('Leessang saved exact English candidate can be validated without another catalog query', async () => {
  const s = song(22842404, 'TV를 껐네...', ['Leessang', '尹美莱', '权正烈'], 'AsuRaBalBalTa', 215986)
  const c = track('1oBUbM6xZOPQoHkMJNrRTp', 'I turned off the TV... (feat. Yoonmirae & Kwon Jung-yeol)',
    ['Leessang', 'YOON MIRAE', 'Kwon Jung-yeol'], 'AsuRaBalBalTa', 215986)
  assert.equal(pickBestMatch(s, [c])?.candidate.id, c.id)
  assert.equal(pickBestMatch(s, [{ ...c, name: 'hit a cow with a mountain in between (feat. Guckkasten)' }]), null)
})
