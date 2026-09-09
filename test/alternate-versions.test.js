import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickAlternateVersion, songSearchQueries } from '../src/matcher.js'
import { SyncService } from '../src/sync.js'
import { cloudRunSummary } from '../src/cloud-policy.js'

const song = (name, artist = 'Singer', dt = 200000, extra = {}) => ({ name, ar: [{ name: artist }], dt, ...extra })
const track = (name, artist = 'Singer', duration_ms = 200000, extra = {}) => ({ id: 'hit', uri: 'spotify:track:hit', name, artists: [{ id: artist, name: artist }], duration_ms, ...extra })
const recall = { allowAlternateVersions: true }

test('second pass accepts same-artist live, extended, acoustic, remix and re-recorded versions', () => {
  for (const title of ['My Song - Live at Tokyo / 2020', 'My Song (Acoustic)', 'My Song - Extended Ver.', 'My Song (DJ Remix)', 'My Song (2021 Version)']) {
    const match = pickAlternateVersion(song('My Song'), [track(title, 'Singer', 280000)])
    assert.ok(match?.alternateVersion, title)
  }
  const karen = song('The Way You Make Me Feel', '莫文蔚', 202856, { id: 277771 })
  const match = pickAlternateVersion(karen, [track(karen.name, 'Karen Mok', 208544, { id: '3PxBghSD7mhVd4ozof4XSd' })])
  assert.ok(match?.alternateVersion, 'the reviewed 2021 re-recording is now permitted')
})

test('edition stripping works on the source, retaining ordinary subtitles', () => {
  assert.ok(pickAlternateVersion(song('My Song (Singer Bootleg)'), [track('My Song')]))
  assert.equal(pickAlternateVersion(song('My Song - Another Story'), [track('My Song')]), null)
  assert.equal(pickAlternateVersion(song('Some'), [track('Someone to Blame')]), null)
})

test('second pass requires same primary artist, not a shared guest or title-only cross-language guess', () => {
  assert.equal(pickAlternateVersion(song('My Song'), [track('My Song', 'Other Singer')]), null)
  assert.equal(pickAlternateVersion(song('My Song'), [track('My Song', 'Other Singer', 200000, { artists: [{ name: 'Other Singer' }, { name: 'Singer' }] })]), null)
  assert.equal(pickAlternateVersion(song('My Song', '未知歌手'), [track('My Song', 'Unknown Singer')]), null)
  assert.equal(pickAlternateVersion(song('Plastic Love (TARA Bootleg)', 'TARA'), [track('Plastic Love', 'Mariya Takeuchi')]), null)
  assert.equal(pickAlternateVersion(song('My Song'), [track('My Song', 'Singer', 200000, { is_playable: false })]), null)
})

test('exact recording always wins before a second-pass alternative', async () => {
  const exact = track('My Song', 'Singer', 200000, { id: 'exact' })
  const live = track('My Song - Live', 'Singer', 270000, { id: 'live' })
  const match = await findTrackMatch(song('My Song'), async () => [live, exact], {}, recall)
  assert.equal(match.candidate.id, 'exact')
  assert.ok(!match.alternateVersion)
})

test('second pass reuses the full pool with no duplicate Spotify calls', async () => {
  const source = song('Sunset', 'BLU-SWING', 231653)
  const queries = []
  const match = await findTrackMatch(source, async q => {
    queries.push(q)
    return [track('Sunset', 'Blu-Swing', 210546)]
  }, {}, recall)
  assert.ok(match.alternateVersion)
  assert.equal(queries.length, songSearchQueries(source).length)
  assert.equal(new Set(queries).size, queries.length)
})

test('bounded edition-free searches can recover misses after all strict searches', async () => {
  const source = song('My Song (2021 Version)')
  const strictQueries = new Set(songSearchQueries(source))
  const extra = []
  const match = await findTrackMatch(source, async q => {
    if (strictQueries.has(q)) return []
    extra.push(q)
    return q === 'My Song Singer' ? [track('My Song')] : []
  }, {}, recall)
  assert.ok(match)
  assert.ok(extra.length > 0 && extra.length <= 6)
})

test('provider failures are not converted into misses or retried by second pass', async () => {
  let calls = 0
  const error = Object.assign(new Error('cooldown'), { status: 429 })
  await assert.rejects(findTrackMatch(song('My Song'), async () => { calls++; throw error }, {}, recall), { status: 429 })
  assert.equal(calls, 1)
})

test('every normal sync applies second-pass policy, preserves order and labels alternatives', async () => {
  const state = { settings: { neteaseCookie: 'MUSIC_U=test', timezone: 'Asia/Shanghai' }, spotify: { refreshToken: 'test' }, sync: { playlistId: 'existing' } }
  const sources = [song('Sunset', 'BLU-SWING', 231653, { id: 1 }), song('Exact', 'Singer', 200000, { id: 2 }), song('Unavailable', 'Missing', 200000, { id: 3 })]
  const candidates = [track('Sunset', 'Blu-Swing', 210546, { id: 'sunset', uri: 'spotify:track:sunset', album: { name: 'TRANSIT' } }), track('Exact')]
  let uris; let description
  const store = { state, async update(fn) { fn(state) } }
  const spotify = { async searchTracks() { return candidates }, async replacePlaylist(id, values) { uris = values }, async updatePlaylist(id, details) { description = details.description } }
  const run = await new SyncService(store, spotify, async () => sources).run()
  assert.equal(run.matchedCount, 2)
  assert.equal(run.alternateVersionCount, 1)
  assert.deepEqual(uris, ['spotify:track:sunset', 'spotify:track:hit'])
  assert.equal(run.matches[0].spotify.durationMs, 210546)
  assert.equal(run.matches[0].alternateVersion, true)
  assert.equal(run.matches[1].alternateVersion, false)
  assert.equal(run.unmatched[0].diagnostics.alternateVersionChecked, true)
  assert.match(description, /1 alternate versions/)
  assert.match(cloudRunSummary(run), /1 alternate versions/)
  assert.equal(state.sync.lastSuccessfulRun.alternateVersionCount, 1)
})
