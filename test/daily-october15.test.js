import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, knownTrackIds, songSearchStages } from '../src/matcher.js'

const song = (id, name, artists, album, dt) => ({ id, name, ar: artists.map(name => ({ name })), al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })),
  album: { name: album }, duration_ms, uri: `spotify:track:${id}`, is_playable: true })
// Saved candidate/public embed metadata; account availability is simulated.
const cases = [
  [song(658418, '最高の片想い', ['タイナカ彩智'], '最高の片想い', 269560),
    track('37Ow6jc1jv7D2Pyf9AhQWJ', '最高の片想い', ['タイナカ サチ'], '最高の片想い', 269560)],
  [song(22773568, 'ひとり上手', ['中島みゆき'], '大吟醸', 257053),
    track('7oSAzD9RTyiPHOM16noKMl', 'ひとり上手', ['Miyuki Nakajima'], 'ひとり上手', 254800)],
  [song(2725982315, '斑彩', ['kobasolo', '由 -iu-'], '斑彩', 241638),
    track('37hzEkgqQyxykySKnCi7FM', '斑彩', ['kobasolo', '由 -iu-'], '斑彩', 241638)],
]

test('reviewed October 15 recordings resolve with one freshly playable lookup and no searches', async () => {
  for (const [s, t] of cases) {
    const d = {}
    const result = await findTrackMatch(s, async () => assert.fail('redundant search'), d, {
      findKnownTracks: async (_s, { ids, takeQuery }) => {
        assert.deepEqual(ids, [t.id]); assert.ok(takeQuery()); return [t]
      },
    })
    assert.equal(result?.candidate.id, t.id)
    assert.equal(result.primaryMatch, true)
    assert.equal(d.catalogQueryCount, 1)
    assert.equal(d.queryCount, 0)
  }
})

test('former/current and romanized artist names work for new songs in both directions', () => {
  for (const group of [['タイナカ彩智', 'タイナカ サチ', 'タイナカサチ', 'Sachi Tainaka'], ['中島みゆき', 'Miyuki Nakajima']]) {
    for (const left of group) for (const right of group) {
      const s = song(0, 'A New Recording', [left], 'Album', 200000)
      assert.equal(pickBestMatch(s, [track('t', s.name, [right], 'Album', s.dt)])?.primaryMatch, true, `${left} -> ${right}`)
    }
  }
  const stages = songSearchStages(cases[1][0])
  assert.ok(stages[0].queries.slice(0, 3).some(q => q.includes('Miyuki Nakajima')))
})

test('reviewed pointers do not bypass wrong artist, shared guest, backing track or source identity checks', () => {
  for (const [s, t] of cases) {
    for (const changes of [{ name: 'Another Song' }, { ar: [{ name: 'Other Performer' }] }, { id: 0 }]) {
      assert.deepEqual(knownTrackIds({ ...s, ...changes }), [])
    }
    const cover = { ...t, artists: [{ name: 'Other Performer' }, ...t.artists.slice(1)] }
    assert.equal(pickBestMatch(s, [cover]), null)
    assert.equal(pickAlternateVersion(s, [cover]), null)
    assert.equal(pickBestMatch(s, [{ ...t, name: t.name + ' - Instrumental' }]), null)
    assert.equal(pickAlternateVersion(s, [{ ...t, name: t.name + ' - Instrumental' }]), null)
    assert.equal(pickBestMatch(s, [{ ...t, is_playable: false }]), null)
  }
  const [s, t] = cases[2]
  assert.equal(pickBestMatch(s, [{ ...t, artists: [t.artists[0], { name: 'Other Singer' }] }]), null)
})

test('a missing pointer falls back under the same budget and a denial is never accepted', async () => {
  const [s, t] = cases[0], d = {}
  let searches = 0
  const result = await findTrackMatch(s, async () => { searches++; return [t] }, d, {
    maxQueries: 2,
    findKnownTracks: async (_s, { takeQuery }) => { takeQuery(); return [] },
  })
  assert.equal(result?.candidate.id, t.id)
  assert.equal(searches, 1)
  assert.equal(d.catalogQueryCount, 2)
  const denied = {}
  assert.equal(await findTrackMatch(s, async () => [{ ...t, is_playable: undefined }], denied, {
    maxQueries: 3,
    findKnownTracks: async (_s, { takeQuery }) => { takeQuery(); return [{ ...t, is_playable: false }] },
  }), null)
  assert.ok(denied.catalogQueryCount <= 3)
})

test('provider cooldown aborts the reviewed lookup immediately without another search', async () => {
  const [s] = cases[0]
  const error = Object.assign(new Error('cooldown'), { status: 429, retryAfterSeconds: 3600 })
  await assert.rejects(findTrackMatch(s, async () => assert.fail('must stop'), {}, {
    findKnownTracks: async () => { throw error },
  }), e => e === error)
})
