const EDITION_WORDS = /\b(remaster(?:ed)?|live|acoustic|radio edit|deluxe|version|mono|stereo|explicit)\b/gi

// Cross-catalog aliases that cannot be derived by normalizing punctuation alone.
// Keys are stable NetEase display names; values are Spotify-searchable names.
const TITLE_ALIASES = new Map([
  ['自転車にのって', ['Jitenshani Notte']],
  ['Rainy Saturday Coffee Break', ['レイニー・サタデイ＆コーヒー・ブレイク']],
  ['Rainy Saturday ＆ Coffee Break', ['Rainy Saturday & Coffee Break']],
  ['썸', ['Some', 'Some (feat. Lil Boi)']],
  ['사랑 하지 마', ["Don't Love Me"]],
  ["사랑 하지 마 (Don't Love Me)", ["Don't Love Me"]],
])

const ARTIST_ALIASES = new Map([
  ['大橋純子', ['Junko Ohashi']],
  ['林哲司', ['Tetsuji Hayashi']],
  ['昭宥', ['SOYOU']],
  ['소유', ['SOYOU']],
  ['정기고', ['Junggigo']],
  ['릴보이', ['Lil Boi', 'lIlBOI']],
  ['原田知世', ['Tomoyo Harada']],
  ['효린', ['HYOLYN']],
  ['孝琳', ['HYOLYN']],
])

export function normalize(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(EDITION_WORDS, ' ')
    .replace(/\b(feat|featuring|ft)\.?\b.*$/i, '')
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function bigrams(value) {
  const compact = normalize(value).replace(/\s+/g, '')
  if (compact.length < 2) return new Set(compact ? [compact] : [])
  const result = new Set()
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.add(compact.slice(index, index + 2))
  }
  return result
}

export function similarity(left, right) {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const aSet = bigrams(a)
  const bSet = bigrams(b)
  let overlap = 0
  for (const token of aSet) if (bSet.has(token)) overlap += 1
  return (2 * overlap) / (aSet.size + bSet.size || 1)
}

export function songArtists(song) {
  const artists = song.ar || song.artists || []
  return artists.map((artist) => artist.name).filter(Boolean)
}

function catalogAliases(map, value) {
  const exact = map.get(value)
  if (exact) return exact
  const normalized = normalize(value)
  for (const [key, aliases] of map) {
    if (normalize(key) === normalized) return aliases
  }
  return []
}

export function songTitles(song) {
  return [...new Set([
    song.name,
    ...(song.tns || []),
    ...(song.transNames || []),
    ...catalogAliases(TITLE_ALIASES, song.name),
  ].filter(Boolean))]
}

export function searchableArtists(song) {
  return [...new Set(songArtists(song).flatMap((artist) => [artist, ...catalogAliases(ARTIST_ALIASES, artist)]))]
}

export function songSearchQueries(song) {
  const titles = songTitles(song)
  const artists = searchableArtists(song)
  const queries = []
  for (const title of titles) {
    for (const artist of artists.slice(0, 4)) {
      queries.push(`track:"${title}" artist:"${artist}"`)
    }
    queries.push(`${title} ${artists.join(' ')}`)
  }
  return [...new Set(queries)]
}

export function songAlbum(song) {
  return song.al?.name || song.album?.name || ''
}

export function songDuration(song) {
  return Number(song.dt || song.duration || 0)
}

export function scoreCandidate(song, candidate) {
  const title = Math.max(...songTitles(song).map((value) => similarity(value, candidate.name)))
  const neteaseArtists = searchableArtists(song)
  const spotifyArtists = (candidate.artists || []).map((artist) => artist.name)
  let artist = 0
  for (const left of neteaseArtists) {
    for (const right of spotifyArtists) artist = Math.max(artist, similarity(left, right))
  }

  const sourceDuration = songDuration(song)
  const targetDuration = Number(candidate.duration_ms || 0)
  const difference = sourceDuration && targetDuration ? Math.abs(sourceDuration - targetDuration) : Infinity
  const duration = difference <= 2500 ? 1 : difference <= 8000 ? 0.7 : difference <= 18000 ? 0.25 : 0
  const album = similarity(songAlbum(song), candidate.album?.name || '')

  return Number((title * 0.56 + artist * 0.28 + duration * 0.12 + album * 0.04).toFixed(4))
}

export function pickBestMatch(song, candidates, threshold = 0.68) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(song, candidate) }))
    .sort((left, right) => right.score - left.score)
  return ranked[0]?.score >= threshold ? ranked[0] : null
}

export function sourceSongView(song) {
  return {
    id: song.id,
    name: song.name,
    artists: songArtists(song),
    album: songAlbum(song),
    durationMs: songDuration(song),
  }
}
