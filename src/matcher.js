import OpenCC from 'opencc-js'

const toSimplified = OpenCC.Converter({ from: 'hk', to: 'cn' })
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })
const toJapanese = OpenCC.Converter({ from: 'cn', to: 'jp' })
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

// Verified translations are scoped to a source track, not every song sharing a
// title. They are a last resort; they never bypass identity/version checks.
const VERIFIED_TITLES = new Map([
  ['1317162660', ['Haru no Mori no Kaiten Mokuba']],
  ['1305365761', ['素顔のままで']],
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
  ['郑中基', ['Ronald Cheng']],
  ['卫兰', ['Janice Vidal']],
  ['森山直太朗', ['Naotaro Moriyama']],
  ['中嶋美智代', ['Michiyo Nakajima']],
  ['斉藤和義', ['Kazuyoshi Saito']],
  ['西原健一郎', ['Kenichiro Nishihara']],
])

export function normalize(value = '') {
  return toSimplified(String(value))
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
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  // A short substring is not an identity: some/Someone and werf/Werff.
  if (shorter.length >= 8 && shorter.length / longer.length >= 0.5 &&
    (` ${longer} `).includes(` ${shorter} `)) return 0.9
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

function strings(value) {
  return (Array.isArray(value) ? value : [value]).filter((item) => typeof item === 'string' && item.trim())
}

function unique(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function metadataNames(entity = {}) {
  if (!entity || typeof entity !== 'object') return []
  return [entity.name, ...strings(entity.tns), ...strings(entity.transNames),
    ...strings(entity.alia), ...strings(entity.alias)].filter((value) => typeof value === 'string')
}

function scripts(value) {
  return ['Latin', 'Han', 'Hiragana', 'Katakana', 'Hangul', 'Cyrillic', 'Arabic']
    .filter((script) => new RegExp(`\\p{Script=${script}}`, 'u').test(value))
}

function differentScripts(left, right) {
  const a = scripts(left)
  const b = scripts(right)
  return a.length > 0 && b.length > 0 && !a.some((script) => b.includes(script))
}

// Only split cross-script parenthetical titles, not ordinary subtitles or editions.
export function titleVariants(value) {
  if (typeof value !== 'string') return []
  const full = value.normalize('NFKC').trim()
  const brackets = [...full.matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】/gu)]
  const base = full.replace(/\([^()]*\)|\[[^\[\]]*\]|【[^【】]*】/gu, ' ').trim()
  const translations = brackets.map((part) => (part[1] || part[2] || part[3]).trim())
    .filter((part) => differentScripts(base, part) && !/\b(feat|ft|featuring|live|remaster\w*|version|edit|mix|acoustic|instrumental|karaoke)\b|现场|現場|伴奏|ライブ/i.test(part))
  return unique([full, ...(translations.length ? [base, ...translations] : [])])
}

export function songTitles(song, { manual = true } = {}) {
  return unique([
    ...metadataNames(song).flatMap(titleVariants),
    ...(manual ? catalogAliases(TITLE_ALIASES, song.name).flatMap(titleVariants) : []),
    ...(manual ? VERIFIED_TITLES.get(String(song.id)) || [] : []),
  ])
}

export function searchableArtists(song, { manual = true } = {}) {
  const names = (song.ar || song.artists || []).flatMap(metadataNames)
  return unique(names.flatMap((artist) => [artist, ...(manual ? catalogAliases(ARTIST_ALIASES, artist) : [])]))
}

function quoted(value) {
  return String(value).replace(/["\\\r\n]/g, ' ').trim()
}

function searchTitle(value) {
  // Spotify free-text search understands aliases better than exact filters.
  // Remove feature credits from queries, but retain recording-version labels.
  return String(value).normalize('NFKC').replace(/\s*\(?\b(?:feat|featuring|ft)\b\.?\s+.*$/i, '').trim()
}

function queryVariants(values) {
  // Do not deduplicate with normalize(): Spotify must receive both glyph forms.
  return [...new Set(values.flatMap((value) => {
    const clean = searchTitle(value)
    // A tilde-delimited subtitle can prevent Spotify from retrieving even the
    // exact recording. Shorten queries only; retain the full title for scoring.
    const base = clean.split(/[~〜～]/u)[0].trim()
    const names = [clean, clean.replace(/~/g, '～'), clean.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(), ...(base.length >= 4 ? [base] : [])]
    return names.flatMap(name => [name, toTraditional(name), toJapanese(name)])
  }).filter(Boolean))]
}

export function songSearchStages(song) {
  // Bound fan-out on unusually verbose catalog metadata.
  const titles = queryVariants(songTitles(song, { manual: false })).slice(0, 12)
  const artists = queryVariants(searchableArtists(song, { manual: false })).slice(0, 4)
  const combined = (names, credits) => names.flatMap((title) => credits.map((artist) =>
    `track:"${quoted(title)}" artist:"${quoted(artist)}"`))
  const titleOnly = (names) => names.map((title) => `track:"${quoted(title)}"`)
  const plain = (names, credits) => [...names, ...names.slice(0, 4).flatMap((title) =>
    credits.slice(0, 2).map((artist) => `${quoted(title)} ${quoted(artist)}`))]
  const fallbackTitles = queryVariants(songTitles(song)).slice(0, 16)
  const fallbackArtists = searchableArtists(song).slice(0, 8)
  const albums = queryVariants(metadataNames(song.al || song.album)).slice(0, 2)
  // Album filters can surface an original recording buried under many live
  // releases. These are retrieval hints, never exemptions from scoring.
  const albumQueries = (credits) => albums.flatMap(album => [
    ...credits.map(artist => `album:"${quoted(album)}" artist:"${quoted(artist)}"`),
    ...titles.slice(0, 4).map(title => `track:"${quoted(title)}" album:"${quoted(album)}"`),
  ])
  const seen = new Set()
  return [
    { name: 'metadata', manual: false, queries: combined(titles, artists) },
    { name: 'title-only', manual: false, queries: titleOnly(titles) },
    { name: 'free-text', manual: false, queries: plain(titles, artists) },
    { name: 'album', manual: false, queries: albumQueries(artists) },
    { name: 'manual-alias', manual: true, queries: [...combined(fallbackTitles, fallbackArtists), ...titleOnly(fallbackTitles), ...plain(fallbackTitles, fallbackArtists), ...albumQueries(fallbackArtists)] },
  ].map((stage) => ({ ...stage, queries: stage.queries.filter((query) => {
    if (seen.has(query)) return false
    seen.add(query)
    return true
  }) }))
}

export function songSearchQueries(song) {
  return songSearchStages(song).flatMap((stage) => stage.queries)
}

export function songAlbum(song) {
  return song.al?.name || song.album?.name || ''
}

export function songDuration(song) {
  return Number(song.dt || song.duration || 0)
}

function evidence(song, candidate, options) {
  const targetTitles = titleVariants(candidate.name)
  const title = Math.max(0, ...songTitles(song, options).flatMap((value) => targetTitles.map((target) => similarity(value, target))))
  const neteaseArtists = searchableArtists(song, options)
  const spotifyArtists = (candidate.artists || []).map((artist) => artist.name)
  let artist = 0
  for (const left of neteaseArtists) {
    for (const right of spotifyArtists) {
      const credits = [left, ...String(left).split(/\s*[,&]\s*/)]
      artist = Math.max(artist, ...credits.map((credit) => similarity(credit, right)))
    }
  }

  const sourceDuration = songDuration(song)
  const targetDuration = Number(candidate.duration_ms || 0)
  const difference = sourceDuration && targetDuration ? Math.abs(sourceDuration - targetDuration) : Infinity
  const duration = difference <= 2500 ? 1 : difference <= 8000 ? 0.7 : difference <= 18000 ? 0.25 : 0
  const album = Math.max(0, ...metadataNames(song.al || song.album).map((name) => similarity(name, candidate.album?.name || '')))
  const crossScript = neteaseArtists.length > 0 && spotifyArtists.length > 0 &&
    neteaseArtists.every((left) => spotifyArtists.every((right) => differentScripts(left, right)))
  // An exact short/common title alone is not sufficient across unrelated credits.
  const distinctive = targetTitles.some((name) => {
    const length = normalize(name).replace(/\s/g, '').length
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(name) ? length >= 5 : length >= 8
  })
  const crossLanguage = crossScript && title >= 0.98 && difference <= 2500 && (album >= 0.75 || distinctive)
  const versionMismatch = recordingKinds(song.name) !== recordingKinds(candidate.name)
  const sourceCredits = song.ar || song.artists || []
  const guestNames = sourceCredits.slice(1).flatMap(metadataNames)
  const targetGuests = spotifyArtists.slice(1)
  // The same band may re-record a song with another singer. A shared primary
  // credit is insufficient when the additional credits explicitly disagree.
  // Unknown cross-script guest names remain neutral, not presumed different.
  const primaryNames = metadataNames(sourceCredits[0])
  const primaryAgrees = primaryNames.some(name => similarity(name, spotifyArtists[0]) >= 0.98)
  const creditConflict = primaryAgrees && guestNames.length > 0 && targetGuests.length > 0 &&
    guestNames.every(left => targetGuests.every(right => !differentScripts(left, right) && similarity(left, right) < 0.85))
  const durationCompatible = !sourceDuration || !targetDuration || difference <= 18000
  const eligible = !versionMismatch && !creditConflict && durationCompatible && title >= 0.78 && (artist >= 0.85 || crossLanguage)
  const weighted = title * 0.56 + artist * 0.28 + duration * 0.12 + album * 0.04
  const score = Number(Math.max(weighted, crossLanguage ? 0.82 + album * 0.1 : 0).toFixed(4))
  return { title, artist, album, difference, crossLanguage, creditConflict, eligible, score }
}

function recordingKinds(name = '') {
  const value = String(name).normalize('NFKC')
  return [
    /\blive\b|现场|現場|ライブ/i,
    /\bacoustic\b|不插电|不插電|アコースティック/i,
    /\binstrumental\b|\bkaraoke\b|伴奏|カラオケ/i,
    /\bremix\b|\bre-mix\b|リミックス/i,
    /\bsped\s*up\b|\bslowed\b/i,
    /\boriginal\s+ver(?:sion)?\b/i,
  ].map((pattern) => Number(pattern.test(value))).join('')
}

export function scoreCandidate(song, candidate, options = {}) {
  return evidence(song, candidate, options).score
}

function sameRecording(left, right) {
  if (left.id && left.id === right.id) return true
  if (left.external_ids?.isrc && left.external_ids.isrc === right.external_ids?.isrc) return true
  const credits = (candidate) => (candidate.artists || []).map((artist) => artist.id || normalize(artist.name)).sort().join('|')
  return credits(left) && credits(left) === credits(right) && normalize(left.name) === normalize(right.name) &&
    Math.abs(Number(left.duration_ms) - Number(right.duration_ms)) <= 2500
}

function compatibleRelease(left, right, source) {
  if (sameRecording(left.candidate, right.candidate)) return true
  // Distributors may use separate localized guest-artist IDs on a compilation.
  // Only collapse these when the primary artist ID, title and duration agree,
  // and both candidates independently match the source's artist and title.
  const a = left.candidate; const b = right.candidate
  return left.artist >= 0.98 && right.artist >= 0.98 && left.title >= 0.98 && right.title >= 0.98 &&
    a.artists?.[0]?.id && a.artists[0].id === b.artists?.[0]?.id &&
    normalize(a.name) === normalize(b.name) && recordingKinds(a.name) === recordingKinds(b.name) &&
    Math.abs(a.duration_ms - b.duration_ms) <= 2500 &&
    Math.abs(songDuration(source) - a.duration_ms) <= 2500 && Math.abs(songDuration(source) - b.duration_ms) <= 2500
}

export function pickBestMatch(song, candidates, threshold = 0.68, options = {}) {
  const ranked = candidates.filter((candidate) => candidate && candidate.is_playable !== false)
    .map((candidate) => ({ candidate, ...evidence(song, candidate, options) }))
    .filter((match) => match.eligible && match.score >= threshold)
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]
  if (!best) return null
  // Duplicated releases are fine; competing recordings need a clear winner.
  const rival = ranked.find((match) => !compatibleRelease(best, match, song))
  if (rival && best.score - rival.score < 0.05) return null
  return best
}

export async function findTrackMatch(song, searchTracks, diagnostics = null) {
  const candidates = new Map()
  let queryCount = 0
  for (const stage of songSearchStages(song)) {
    for (const query of stage.queries) {
      queryCount++
      for (const candidate of await searchTracks(query, 10)) {
        const key = candidate.id || candidate.uri || JSON.stringify(candidate)
        candidates.set(key, candidate)
      }
    }
    // Assess the whole stage, not the first vaguely plausible search result.
    const pool = [...candidates.values()]
    const match = pickBestMatch(song, pool, 0.68, { manual: stage.manual })
    // An artist-filtered query may still return unrelated credits. Broaden the
    // search before choosing a cross-language match so rivals can be compared.
    if (match?.crossLanguage && stage.name === 'metadata') continue
    if (match) return { ...match, searchStage: stage.name }
  }
  if (diagnostics) Object.assign(diagnostics, {
    queryCount, candidateCount: candidates.size,
    candidates: [...candidates.values()].map((candidate) => ({
      ...evidence(song, candidate, { manual: true }), id: candidate.id, name: candidate.name,
      artists: (candidate.artists || []).map((artist) => artist.name), album: candidate.album?.name,
      durationMs: candidate.duration_ms,
    })).sort((a, b) => b.score - a.score).slice(0, 5),
  })
  return null
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
