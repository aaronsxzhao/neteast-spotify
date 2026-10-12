import test from 'node:test'
import assert from 'node:assert/strict'
import { songTitles, pickBestMatch, pickAlternateVersion, knownTrackIds, findTrackMatch } from '../src/matcher.js'

const song = (id, name, artist, album, dt) => ({ id, name, ar: [{ name: artist }], al: { name: album }, dt })
const track = (id, name, artists, album, duration_ms) => ({ id, name, artists: artists.map(name => ({ name })), album: { name: album }, duration_ms, is_playable: true })
const english = song(28613731, '好きだよ。~100回の後悔~ (English Ver.)', "Che'Nelle", 'ラブ・ソングス2', 306466)
const englishHit = track('1acs8AqvnIrc9bewIiUoi1', '好きだよ。～100回の後悔～ - English Ver．', ["Che'Nelle"], 'ラブ・ソングス2', 306466)
const wrongEnglish = track('7m2hqdT7lMUcK5nhF0qZpf', '逢いたくていま - English Ver．', ["Che'Nelle"], 'ラブ・ソングス2', 306720)
const goodbye = song(526439257, 'Goodbye to Your Love', '二宮愛', 'Finding Stride', 282749)
const duo = track('1cWKLaJKsSjekK8DV9gFCC', goodbye.name, ['re:plus', 'Ai Ninomiya'], 'Finding Stride', 282706)
const group = track('5JzjnA5ju6UEKzIHsAAqJo', goodbye.name, ['R.A.'], 'Finding Stride', 282706)
const stars = song(22704309, '空に星が綺麗~悲しい吉祥寺~', '斉藤和義', 'FIRE DOG', 154250)
const live = track('5E4VhmW74XkzEmSghAECg5', '空に星が綺麗(Live at 中野サンプラザ 2019.06.13)', ['Kazuyoshi Saito'], 'Time in the Garage Live', 155466)
const musmus = song(22736703, 'ミュゲー', 'THE MUSMUS', 'Uplift Spice', 275658)
const uplift = track('0vUqrJJrAl5Xa8cAVgPqhi', 'ミュゲー', ['UPLIFT SPICE'], 'UPLIFT SPICE', 275600)

test('language edition labels never become translations or match unrelated songs', () => {
  assert.deepEqual(songTitles(english), [english.name])
  assert.equal(pickBestMatch(english, [wrongEnglish]), null)
  assert.equal(pickAlternateVersion(english, [wrongEnglish]), null)
  assert.equal(pickBestMatch(english, [wrongEnglish, englishHit])?.candidate.id, englishHit.id)
  for (const language of ['English', 'Japanese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']) {
    const s = song(0, `测试歌 (${language} Ver.)`, 'Singer', 'Album', 200000)
    s.tns = [`${language} Ver.`, 'Another real title']
    assert.deepEqual(songTitles(s), [s.name, 'Another real title'])
    const c = track('hit', `测试歌 - ${language} Version`, ['Singer'], 'Album', 200000)
    assert.ok(pickBestMatch(s, [c]))
    for (const name of ['测试歌', `测试歌 (${language === 'English' ? 'Japanese' : 'English'} Ver.)`, `别的歌 - ${language} Version`]) {
      assert.equal(pickBestMatch(s, [{ ...c, name }]), null)
      assert.equal(pickAlternateVersion(s, [{ ...c, name }]), null)
    }
  }
  assert.ok(songTitles(song(0, '韩文 (Genuine translation)', 'Singer', '', 0)).includes('Genuine translation'))
})

test('reviewed collaboration requires full source identity, roster, album and duration', () => {
  assert.equal(pickBestMatch(goodbye, [duo, group])?.identityEvidence, 'reviewed-complete-roster')
  for (const c of [duo, group]) {
    for (const changed of [{ ...goodbye, id: 0 }, { ...goodbye, name: 'Other song' }, { ...goodbye, ar: [{ name: 'Other artist' }] }]) {
      assert.equal(pickBestMatch(changed, [c]), null)
    }
    for (const change of [{ album: { name: 'Other album' } }, { duration_ms: 300000 }, { is_playable: false },
      { artists: [{ name: 're:plus' }] }, { artists: [...duo.artists, { name: 'Unverified guest' }] },
      { name: goodbye.name + ' (Instrumental)' }]) {
      assert.equal(pickBestMatch(goodbye, [{ ...c, ...change }]), null)
    }
  }
  assert.equal(pickBestMatch(goodbye, [track('wrong', goodbye.name, ['Omen Faculty'], 'Other album', 280530)]), null)
})

test('reviewed subtitle equivalence permits same-artist live only via alternate mode', () => {
  assert.equal(pickBestMatch(stars, [live]), null)
  assert.ok(pickAlternateVersion(stars, [live])?.alternateVersion)
  assert.equal(pickAlternateVersion({ ...stars, id: 0 }, [live]), null)
  assert.equal(pickAlternateVersion({ ...stars, name: '空に星が綺麗~別の歌~' }, [live]), null)
  assert.equal(pickAlternateVersion(stars, [{ ...live, artists: [{ name: 'Cover Singer' }] }]), null)
  assert.equal(pickAlternateVersion(stars, [{ ...live, name: '空に星が綺麗 (Inst.)' }]), null)
})

test('historical band credit is recording-scoped and unknown Nepenthe credit remains rejected', () => {
  assert.ok(pickBestMatch(musmus, [uplift]))
  assert.equal(pickBestMatch({ ...musmus, id: 0 }, [uplift]), null)
  assert.equal(pickBestMatch({ ...musmus, name: 'Other song' }, [{ ...uplift, name: 'Other song' }]), null)
  const s = song(3367354676, 'Nepenthe', 'phifi', 'Before I Turn 18', 173500)
  const c = track('3ExowdjyshjrO94pZqxOKt', 'Nepenthe', ['sudicideexpert'], 'Before I Turn 18', 173500)
  assert.equal(pickBestMatch(s, [c]), null)
  assert.equal(pickAlternateVersion(s, [c]), null)
})

// Public-page targets use approximate durations and mocked availability.
// These fixtures are not evidence that an account can play the recordings.
const targets = [
  [goodbye, duo], [english, englishHit], [musmus, uplift],
  [song(2669078243, 'エルフ', 'Ado', 'エルフ', 264395), track('3kNjQCPlaZeQJV1u3HlmWC', 'Elf', ['Ado'], 'Elf', 264000)],
  [song(2690545311, '恋に恋せよ', 'ヒグチアイ', '恋に恋せよ', 189700), track('7LwHwVjEPBSxZoXtY52jcS', 'Fall in love with love', ['Ai Higuchi'], 'Sihou Shugi', 190000)],
  [song(1391839711, 'Follow', 'Vantage', 'Follow', 234397), track('1G9NeheOamTjkYtTv3VtMN', 'Follow', ['Vantage'], "J-Funk City : Vantage's Edits Collection", 234000)],
]

test('six source-scoped pointers resolve in one request and retain safety gates', async () => {
  for (const [s, c] of targets) {
    assert.deepEqual(knownTrackIds(s), [c.id])
    const d = {}
    const match = await findTrackMatch(s, async () => { throw Error('unnecessary search') }, d, {
      findKnownTracks: async (_s, { takeQuery }) => takeQuery() ? [c] : [],
    })
    assert.equal(match?.candidate.id, c.id, s.name)
    assert.equal(d.catalogQueryCount, 1)
    assert.deepEqual(knownTrackIds({ ...s, name: 'Other title' }), [])
    const none = await findTrackMatch(s, async () => [], {}, {
      findKnownTracks: async (_s, { takeQuery }) => takeQuery() ? [{ ...c, is_playable: false }] : [], allowAlternateVersions: true,
    })
    assert.equal(none, null)
    for (const maxQueries of [0, 1, 4, 18]) {
      let calls = 0; const d = {}
      await findTrackMatch(s, async () => { calls++; return [] }, d, {
        findKnownTracks: async (_s, { takeQuery }) => { if (takeQuery()) calls++; return [] }, maxQueries,
      })
      assert.equal(calls, d.catalogQueryCount)
      assert.ok(calls <= maxQueries)
    }
    const rateLimit = Object.assign(Error('cooldown'), { status: 429 })
    await assert.rejects(findTrackMatch(s, async () => { throw Error('must not fall back') }, {}, {
      findKnownTracks: async () => { throw rateLimit },
    }), e => e === rateLimit)
  }
})
