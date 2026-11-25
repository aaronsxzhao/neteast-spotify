// Reviewed identities are data, not global title/artist aliases. Never learn
// from score alone: each row requires an independently checked recording.
const recordings = [
  {
    "source": {
      "id": 32069683,
      "name": "ちょっと待ってよ",
      "artists": [
        "never young beach"
      ],
      "album": "YASHINOKI HOUSE",
      "durationMs": 203640
    },
    "target": {
      "id": "42gokOGxxInN6n43Xekxqk",
      "name": "Chotto Matteyo",
      "artists": [
        "never young beach"
      ],
      "album": "YASHINOKI HOUSE",
      "durationMs": 203626
    },
    "evidence": "https://music.apple.com/sg/song/988345548",
    "verifiedAt": "2026-11-16T01:10:53.832Z"
  },
  {
    "source": {
      "id": 2103300863,
      "name": "今天是我的",
      "artists": [
        "汪晨蕊"
      ],
      "album": "今天是我的",
      "durationMs": 195600
    },
    "target": {
      "id": "0AcJw5tom8Lz4yocOlpwv9",
      "name": "今天是我的",
      "artists": [
        "汪晨蕊"
      ],
      "album": "今天是我的",
      "durationMs": 195600
    },
    "evidence": "docs/catalog-review-2026-11-13.md",
    "verifiedAt": "2026-11-16T01:09:41.908Z"
  },
  {
    "source": {
      "id": 2680631339,
      "name": "いとしのエリー",
      "artists": [
        "サザンオールスターズ"
      ],
      "album": "いとしのエリー",
      "durationMs": 266066
    },
    "target": {
      "id": "5f7nYDvM5Hj9cPJnbwZrre",
      "name": "いとしのエリー",
      "artists": [
        "サザンオールスターズ"
      ],
      "album": "バラッド　'77～'82",
      "durationMs": 265373
    },
    "evidence": "https://southernallstars.jp/discography/artist/1/detail/82/",
    "verifiedAt": "2026-11-16T01:11:33.197Z"
  },
  {
    "source": {
      "id": 2139361238,
      "name": "ずっとずっとずっと",
      "artists": [
        "大橋トリオ"
      ],
      "album": "『まなざし』 ～羊毛とおはなトリビュート～",
      "durationMs": 262755
    },
    "target": {
      "id": "3wBVPyrHeUoyCV2SVX7lQb",
      "name": "ずっとずっとずっと",
      "artists": [
        "Ohashi Trio"
      ],
      "album": "『まなざし』 ～羊毛とおはなトリビュート～",
      "durationMs": 262754
    },
    "evidence": "https://ohashi-trio.com/news/detail.php?id=1115771",
    "verifiedAt": "2026-11-16T10:32:39.979Z"
  },
  {
    "source": {
      "id": 454567,
      "name": "グッドバイ・デイ",
      "artists": [
        "来生たかお"
      ],
      "album": "テーマ・ソングス(1)CMソン",
      "durationMs": 323996
    },
    "target": {
      "id": "2lz7CkVTDjtHamN6zaQJZj",
      "name": "Goodbye Day",
      "artists": [
        "Takao Kisugi"
      ],
      "album": "Goodbye Day",
      "durationMs": 319000
    },
    "evidence": "https://www.universal-music.co.jp/kisugi-takao/products/h00k-20154/",
    "verifiedAt": "2026-11-16T10:32:48.001Z"
  },
  {
    "source": {
      "id": 22831533,
      "name": "달아요",
      "artists": [
        "朴正炫"
      ],
      "album": "Come To Where I Am",
      "durationMs": 224000
    },
    "target": {
      "id": "1yOXm94bEF0RzSX1gCFyGq",
      "name": "It's Sweet",
      "artists": [
        "Lena Park"
      ],
      "album": "Come To Where I Am",
      "durationMs": 224906
    },
    "evidence": "https://music.amazon.ca/tracks/B07ZRXH6CH",
    "verifiedAt": "2026-11-17T11:38:00.019Z"
  },
  {
    "source": {
      "id": 26343056,
      "name": "Only One (Japanese Ver.)",
      "artists": ["BoA"],
      "album": "Only One(Japanese Ver.)",
      "durationMs": 217506
    },
    "target": {
      "id": "4FOIzp5aI8yIrStN19IPQu",
      "name": "Only One",
      "artists": ["BoA"],
      "album": "Only One",
      "durationMs": 217506,
      "language": "japanese"
    },
    "evidence": "https://avex.jp/boa/discography/detail.php?id=1004128",
    "verifiedAt": "2026-11-18"
  },
  {
    "source": {
      "id": 26123720,
      "name": "無人の島",
      "artists": ["TRUE"],
      "album": "anytime,anywhere",
      "durationMs": 362080
    },
    "target": {
      "id": "7mYFIOsNll6baBQpcakooR",
      "name": "Mujin no Shima",
      "artists": ["唐沢美帆"],
      "album": "Anytime, Anywhere",
      "durationMs": 365826
    },
    "evidence": "https://music.apple.com/us/song/389077799",
    "verifiedAt": "2026-11-23T03:21:24.103Z"
  },
  {
    "source": {
      "id": 2119793675,
      "name": "献给永远的",
      "artists": ["大粉乐队"],
      "album": "献给永远的",
      "durationMs": 228964
    },
    "target": {
      "id": "6XKkzKCnePET1vf3foFDoW",
      "name": "Dedicated forever",
      "artists": ["大粉樂隊"],
      "album": "Dedicated forever",
      "durationMs": 228964
    },
    "evidence": "docs/catalog-review-2026-11-24.md",
    "verifiedAt": "2026-11-24T10:35:55.683Z"
  },
  {
    "source": {
      "id": 22750046,
      "name": "一夜一代に夢見頃",
      "artists": ["平松愛理"],
      "album": "一夜一代に夢見頃",
      "durationMs": 294973
    },
    "target": {
      "id": "6Pt5hiVEE1qKH0mcft72ju",
      "name": "一夜一代に夢見頃",
      "artists": ["Eri Hiramatsu"],
      "album": "一夜一代に夢見頃",
      "durationMs": 293000
    },
    "evidence": "https://www.hiramatsueri.com/release/discography-single",
    "verifiedAt": "2026-11-25T10:34:35.977Z"
  }
]
const clean = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()
const roster = artists => JSON.stringify(artists.map(clean))
export function reviewedRecording(song) {
  return recordings.find(({ source:s }) => String(song.id) === String(s.id) && clean(song.name) === clean(s.name) &&
    roster((song.ar || song.artists || []).map(a=>a.name)) === roster(s.artists) &&
    clean(song.al?.name || song.album?.name) === clean(s.album) && Number(song.dt || song.duration) === s.durationMs)
}
export function reviewedCandidate(song,candidate) {
  const row=reviewedRecording(song),t=row?.target
  return t && candidate.id === t.id && clean(candidate.name) === clean(t.name) &&
    roster((candidate.artists || []).map(a=>a.name)) === roster(t.artists) &&
    clean(candidate.album?.name) === clean(t.album) && Number(candidate.duration_ms) === t.durationMs ? row : null
}
