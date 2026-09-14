import test from 'node:test'
import assert from 'node:assert/strict'
import { findTrackMatch, pickBestMatch, pickAlternateVersion, songTitles, songSearchQueries, songSearchStages, selectSourceAlbums } from '../src/matcher.js'

// Minimal public catalog examples from the saved diagnostics. Offline replay
// proves selection behavior, not account-region availability or a live repair.
const song = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const track = (id, name, artist, album, duration_ms) => ({ id, uri: `spotify:track:${id}`, name,
  artists: [{ name: artist }], album: { name: album }, duration_ms })

test('bilingual artist parentheses match without a manual alias and reject another singer', () => {
  const source = song(1437222759, '蜜湖', '简约情人', '11', 322442)
  const candidate = track('4eQCMLlWEXJGGXNDtyXpyY', '蜜湖', '简约情人（Simple Lover)', '蜜湖', 322442)
  assert.ok(pickBestMatch(source, [candidate], 0.68, { manual: false }))
  assert.ok(pickAlternateVersion(source, [{ ...candidate, duration_ms: 350000 }]))
  assert.equal(pickBestMatch(source, [track('wrong', '蜜湖', '另一个人（Someone Else)', '蜜湖', 322442)]), null)
  const foreign = song(1, 'Unusual Night', '歌手（Artist Name）', 'Album', 200000)
  assert.ok(pickBestMatch(foreign, [track('same', foreign.name, 'Artist Name', 'Album', 200000)], 0.68, { manual: false }))
})

test('verified artist identity resolves SPITZ vs similarly timed unrelated covers', () => {
  const source = song(818186, '空も飛べるはず', 'スピッツ', '空も飛べるはず', 271400)
  const candidates = [track('correct', source.name, 'SPITZ', 'CYCLE HIT 1991-1997 Spitz Complete Single Collection', 271400),
    track('cover', source.name, 'Ms.OOJA', 'THE HITS', 270173), track('cover2', source.name, 'negoto', 'SOAK', 273226)]
  assert.equal(pickBestMatch(source, candidates)?.candidate.id, 'correct')
  assert.equal(pickBestMatch(source, candidates.slice(1)), null)
  assert.equal(pickBestMatch(source, [track('unrelated', source.name, '另一位歌手', source.al.name, source.dt)]), null)
})

test('known artist identity recovers a small title glyph difference without accepting a cover', () => {
  const source = song(27615202, 'ルビーの指輪', '寺尾聰', '青春歌年鑑81', 258066)
  const original = track('0d44Njo4glyy97W6AvvMLT', 'ルビーの指環', 'Akira Terao', 'Reflections', 258040)
  assert.equal(pickBestMatch(source, [original])?.candidate.id, original.id)
  assert.equal(pickBestMatch(source, [{ ...original, artists: [{ name: 'Ms.OOJA' }] }]), null)
})

test('three stored-pool recoveries require no new provider data', async () => {
  const cases = [
    [song(1437222759, '蜜湖', '简约情人', '11', 322442), track('a', '蜜湖', '简约情人（Simple Lover)', '蜜湖', 322442)],
    [song(818186, '空も飛べるはず', 'スピッツ', '空も飛べるはず', 271400), track('b', '空も飛べるはず', 'SPITZ', 'CYCLE HIT', 271400)],
    [song(27615202, 'ルビーの指輪', '寺尾聰', '青春歌年鑑81', 258066), track('c', 'ルビーの指環', 'Akira Terao', 'Reflections', 258040)],
  ]
  for (const [source, candidate] of cases) {
    assert.equal((await findTrackMatch(source, async () => [candidate], {}, { allowAlternateVersions: true }))?.candidate.id, candidate.id)
  }
})

test('non-title notes are removed without removing real titles or genuine translations', () => {
  const source = song(638081, '風の大陸', '西脇唯', '風の大陸 オリジナル・サウンドトラックVol.1', 355590)
  source.tns = ['风之大陆', '动画电影《风之大陆》片头曲 / 映画「風の大陸」OPテーマ']
  assert.deepEqual(songTitles(source), ['風の大陸', '风之大陆'])
  assert.ok(songSearchQueries(source).length < 45)
  assert.ok(!songSearchQueries(source).some(q => q.includes('OPテーマ')))
  assert.deepEqual(songTitles({ name: 'Love is...', alia: ['iTunes Store限定パッケージ'] }), ['Love is...'])
  assert.deepEqual(songTitles({ name: '主題歌' }), ['主題歌'])
})

test('album traversal can recover the twelfth track missing from top-ten search responses', async () => {
  const source = song(638081, '風の大陸', '西脇唯', '風の大陸 オリジナル・サウンドトラックVol.1', 355590)
  const candidate = track('3moDJDcuCTlCVpxWmu2aWR', source.name, source.ar[0].name, '風の大陸 オリジナル・サウンドトラックVol.I', 355590)
  let traversals = 0
  const match = await findTrackMatch(source, async () => [], {}, { findAlbumTracks: async () => { traversals++; return [candidate] } })
  assert.equal(match?.candidate.id, candidate.id)
  assert.equal(match.searchStage, 'album-traversal')
  assert.equal(traversals, 1)
  assert.equal(await findTrackMatch(source, async () => [], {}, {
    findAlbumTracks: async () => [{ ...candidate, name: 'Another Track', duration_ms: source.dt }],
  }), null, 'same artist, album and duration cannot establish a different title')
})

test('album matching handles volume typography but rejects another volume or generic unrelated album', () => {
  const source = song(1, '風の大陸', '西脇唯', '風の大陸 オリジナル・サウンドトラックVol.1', 355590)
  const album = { id: 'a'.repeat(22), name: '風の大陸 オリジナル・サウンドトラックVol.I', artists: [{ name: '西脇唯' }] }
  assert.equal(selectSourceAlbums(source, [album]).length, 1)
  assert.equal(selectSourceAlbums(source, [{ ...album, name: album.name.replace('Vol.I', 'Vol.II') }]).length, 0)
  assert.equal(selectSourceAlbums(song(2, 'A', 'Correct Artist', '11', 1), [{ ...album, name: '11', artists: [{ name: 'Someone Else' }] }]).length, 0)
})

test('scoped translated title hints never equate Secret Desire with Love Squall', () => {
  const source = song(468490434, 'ラブ・スコール', '大野雄二', 'introducing Fujikochans with Yuji Ohno & Friends', 232633)
  source.ar.push({ name: 'Fujikochans' })
  const right = track('right', 'LOVE SQUALL', 'Fujikochans', source.al.name, 232633)
  right.artists.push({ name: 'Yuji Ohno' })
  assert.ok(pickBestMatch(source, [right]))
  assert.equal(pickBestMatch(source, [{ ...right, name: 'Secret Desire', duration_ms: source.dt }]), null)
  assert.equal(pickBestMatch({ ...source, id: 999 }, [right]), null)
  const rainy = song(1950516532, 'Rainy Blue', '德永英明', 'TOKYO - RAINING -', 261480)
  assert.ok(pickBestMatch(rainy, [track('rain', 'レイニー ブルー', 'Hideaki Tokunaga', 'Girl', 261480)]))
})

test('album traversal propagates 429 immediately without trying more fallback searches', async () => {
  let failed = false
  await assert.rejects(findTrackMatch(song(1, 'A Long Title', 'Artist', 'Album', 200000), async () => {
    assert.equal(failed, false); return []
  }, {}, { findAlbumTracks: async () => { failed = true; throw Object.assign(Error('cooldown'), { status: 429 }) } }), { status: 429 })
})

test('manual alias fan-out is bounded and incomplete coverage is recorded, not called unavailable', async () => {
  const source = song(468490434, 'ラブ・スコール', '大野雄二', 'introducing Fujikochans with Yuji Ohno & Friends', 232633)
  source.ar.push({ name: 'Fujikochans' })
  source.tns = ['爱·狂风']
  const stage = songSearchStages(source).find(stage => stage.manual)
  assert.ok(stage.queries.length <= 12)
  assert.equal(stage.limited, true)
  assert.ok(stage.queries.some(q => q.includes('LOVE SQUALL')))
  const diagnostics = {}
  assert.equal(await findTrackMatch(source, async () => [], diagnostics), null)
  assert.equal(diagnostics.queryLimitsApplied, true)
  assert.equal(diagnostics.reason, 'no-results')
})
