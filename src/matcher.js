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
  ['1857311472', ['Rain Song (Feat. Colde)']],
  ['28593407', ['Your scent']],
  ['441489617', ['Find out～One Thing～']],
  ['1996902507', ['モーニング・サブウェイ']],
  ['1950516532', ['レイニー ブルー']],
  ['468490434', ['LOVE SQUALL']],
])

// A performance credit is not a universal artist alias. This reviewed band-set
// relationship applies only to the named source recording, never all re:plus.
const VERIFIED_CREDITS = new Map([
  ['1358089285', { name: 'Solitude -band ver-', artist: 're:plus', aliases: ['re:plus band set'] }],
  // TRUE is an ambiguous display name; do not alias every artist named TRUE.
  ['26123720', { name: '無人の島', artist: 'TRUE', aliases: ['Miho Karasawa', '唐沢美帆'] }],
])

// Reviewed translations are recording-scoped; never translate a common title
// such as 회상 for unrelated artists. All candidates still pass normal scoring.
const SCOPED_TITLES = new Map([
  ['22842411', { name: '회상', artist: 'Leessang', titles: ['remembrance'] }],
  ['285546', { name: '讨厌', artist: '芮恩', titles: ["討厭 (Can't Stand It)"] }],
  // Provenance and limits: docs/catalog-identities.md.
  ['2099327170', { name: '여름에 두었다', artist: 'SHAUN', titles: ['That Summer'] }],
  ['3313987952', { name: 'ハローミューズ', artist: '佐藤日向', titles: ['Hello Muse'] }],
  ['36307466', { name: '달과 6펜스', artist: '沈圭善', titles: ['The Moon and Sixpence'] }],
  ['3313987317', { name: '昔語りふたりぼっち', artist: '生田輝', titles: ['Our Old Tale'] }],
  ['759622', { name: 'よる☆かぜ', artist: 'ケツメイシ', titles: ['yorukaze'] }],
  ['1442021148', { name: '東京フラッシュ', artist: 'Vaundy', titles: ['Tokyo Flash'] }],
  ['1416378346', { name: '아무노래', artist: 'Zico', titles: ['Any song'] }],
  ['22842404', { name: 'TV를 껐네...', artist: 'Leessang', titles: ['I turned off the TV...'] }],
])

// Public catalog pointers are retrieval hints, NOT confirmed account-market
// matches. Verify availability and run normal scoring on every fresh sync.
const CATALOG_HINTS = new Map([
  ['601640', { name: '恋人たちの地平線', artist: '菊池桃子', trackId: '5qhVC29ZJ5uiAyKp6bYDJM' }],
  ['638081', { name: '風の大陸', artist: '西脇唯', trackId: '3moDJDcuCTlCVpxWmu2aWR' }],
  ['41632971', { name: 'Dear', artist: 'lecca', trackId: '6UdNAO674yXHaZroB8PkS7' }],
  ['759622', { name: 'よる☆かぜ', artist: 'ケツメイシ', trackId: '2b3bDmj7kUKXtkYSaJdPmZ' }],
  ['26123720', { name: '無人の島', artist: 'TRUE', trackId: '02OjX2aaE5EAyveeluFR2B' }],
  ['3313987317', { name: '昔語りふたりぼっち', artist: '生田輝', trackId: '7H4ybl0Xjn5EMHDZdoUG7M' }],
  ['22655497', { name: 'Deeper and Deeper', artist: 'CAGNET', trackId: '5ElzKkLs6ZQ1Sp2YEkzHm9' }],
])

export function knownTrackIds(song) {
  const hint = CATALOG_HINTS.get(String(song.id))
  return hint && normalize(song.name) === normalize(hint.name) &&
    metadataNames((song.ar || song.artists || [])[0]).some(name => normalize(name) === normalize(hint.artist))
    ? [hint.trackId] : []
}

// Reviewed re-recordings whose Spotify titles omit their edition label.
// Never replace the 1999 Back recording with Karen Mok's 2021 re-recording.
const DIFFERENT_RECORDINGS = new Map([
  ['277771', new Set(['3PxBghSD7mhVd4ozof4XSd', '4Ul5j6ipSKRZupur8fuBw5'])],
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
  ['広瀬香美', ['Kohmi Hirose']],
  ['小林明子', ['Akiko Kobayashi']],
  ['パイパー', ['PIPER']],
  ['有里知花', ['Chika Yuri', 'Yuri Chika']],
  ['角松敏生', ['Toshiki Kadomatsu']],
  ['黒川沙良', ['Sala Kurokawa']],
  ['莫文蔚', ['Karen Mok']],
  ['久保田利伸', ['Toshinobu Kubota']],
  ['山根麻以', ['Mai Yamane']],
  ['スピッツ', ['SPITZ']],
  ['寺尾聰', ['Akira Terao']],
  ['德永英明', ['Hideaki Tokunaga', '徳永英明']],
  ['菊池桃子', ['Momoko Kikuchi']],
  ['池田聡', ['Satoshi Ikeda']],
  ['大野雄二', ['Yuji Ohno']],
  ['石井明美', ['Akemi Ishii']],
  ['相川七瀬', ['Nanase Aikawa']],
  ['芮恩', ['Rui En']],
  ['白智英', ['Baek Z Young']],
  ['柴田淳', ['Jun Shibata']],
  ['青山テルマ', ['Thelma Aoyama']],
  ['岩崎太整', ['Taisei Iwasaki']],
  ['八神純子', ['Junko Yagami']],
  ['邓丽君', ['Teresa Teng', 'テレサ・テン']],
  ['沈圭善', ['심규선', 'Lucia']],
  ['今井美樹', ['Miki Imai', 'mikiimai']],
  ['平井堅', ['Ken Hirai']],
  ['孝敏', ['Hyomin', '효민']],
  ['로꼬', ['Loco']],
  ['中森明菜', ['Akina Nakamori']],
  ['当山ひとみ', ['Hitomi Tohyama']],
  ['中原めいこ', ['Meiko Nakahara']],
])
const artistAliasCache = new Map()

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
  if (map === ARTIST_ALIASES) {
    const key = normalize(value)
    if (artistAliasCache.has(key)) return artistAliasCache.get(key)
    // Resolve the complete reviewed identity group, including a shared alias
    // (e.g. 孝琳 -> HYOLYN <- 효린), rather than whichever row appears first.
    const names = [value], seen = new Set([key])
    let changed
    do {
      changed = false
      for (const [primary, aliases] of map) {
        const group = [primary, ...aliases]
        if (!group.some(name => seen.has(normalize(name)))) continue
        for (const name of group) {
          const normalized = normalize(name)
          if (!seen.has(normalized)) { seen.add(normalized); names.push(name); changed = true }
        }
      }
    } while (changed)
    const aliases = names.slice(1)
    artistAliasCache.set(key, aliases)
    return aliases
  }
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

// Alias fields also contain distribution notes and TV/film usage, not titles.
// Preserve the actual name even if it happens to contain one of these phrases.
function titleMetadata(song) {
  return metadataNames(song).filter(value => value === song.name ||
    (!/(?:主题曲|主題曲|片头曲|片尾曲|插曲|OPテーマ|EDテーマ|主題歌|限定パッケージ|iTunes\s+Store|ボーナストラック|bonus\s+track|exclusive\s+release)/iu.test(value) &&
      !/^(?:[男女](?:声|聲|生)版|伴奏(?:版)?|现场版|現場版|原唱版|翻唱版|instrumental|karaoke|live(?:\s+version)?|remaster(?:ed)?(?:\s+\d{4})?)$/iu.test(value.trim())))
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

// Split explicit cross-script title wrappers, not ordinary subtitles or editions.
export function titleVariants(value, { dashTranslations = true } = {}) {
  if (typeof value !== 'string') return []
  const full = value.normalize('NFKC').trim()
  const brackets = [...full.matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】/gu)]
  const base = full.replace(/\([^()]*\)|\[[^\[\]]*\]|【[^【】]*】/gu, ' ').trim()
  const translations = brackets.map((part) => (part[1] || part[2] || part[3]).trim())
    .filter((part) => differentScripts(base, part) && !/\b(feat|ft|featuring|live|remaster\w*|version|edit|mix|acoustic|instrumental|karaoke)\b|现场|現場|伴奏|ライブ/i.test(part))
  // Closed dash wrappers also denote translations: Kissしたい -WANNA KISS-.
  // The native title may itself contain Latin words. Require native script on
  // one side and a Latin-only label on the other, not an ordinary subtitle or
  // an edition. Keep the original full name for recording-kind checks.
  const dash = dashTranslations && stripBracketedEditions(full).trim()
    .match(/^(.+?)\s*([-–—])\s*([^–—-]+?)\s*\2$/u)
  const native = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
  const dashTitles = dash && native.test(dash[1]) && /\p{Script=Latin}/u.test(dash[3]) &&
    /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(dash[3]) && !VERSION_LABEL.test(dash[3]) && !/\b(?:mix|feat|ft|featuring)\b/i.test(dash[3])
    ? [dash[1].trim(), dash[3].trim()] : []
  return unique([full, ...(translations.length ? [base, ...translations] : []), ...dashTitles])
}

export function songTitles(song, { manual = true } = {}) {
  const scoped = SCOPED_TITLES.get(String(song.id))
  const reviewed = manual && scoped && normalize(song.name) === normalize(scoped.name) &&
    metadataNames((song.ar || song.artists || [])[0]).some(name => normalize(name) === normalize(scoped.artist))
    ? scoped.titles : []
  return unique([
    ...titleMetadata(song).flatMap(titleVariants),
    ...(manual ? catalogAliases(TITLE_ALIASES, song.name).flatMap(titleVariants) : []),
    ...(manual ? VERIFIED_TITLES.get(String(song.id)) || [] : []),
    ...reviewed.flatMap(titleVariants),
  ])
}

export function searchableArtists(song, { manual = true, identity = false } = {}) {
  const names = (song.ar || song.artists || []).flatMap(metadataNames).flatMap(name => artistNameVariants(name, { identity }))
  const verified = manual && VERIFIED_CREDITS.get(String(song.id))
  const scoped = verified && normalize(song.name) === normalize(verified.name) &&
    names.some(name => normalize(name) === normalize(verified.artist)) ? verified.aliases : []
  return unique([...names.flatMap((artist) => [artist, ...(manual ? catalogAliases(ARTIST_ALIASES, artist) : [])]), ...scoped])
}

function primaryArtistNames(song, options) {
  const primary = (song.ar || song.artists || [])[0]
  return searchableArtists({ ...song, ar: primary ? [primary] : [] }, { ...options, identity: true })
    .flatMap(artistIdentityNames).map(normalize)
}

// Preserve the full credit (including band names with &) and add only bounded
// components. Never accept arbitrary substrings such as Some / Someone.
function artistIdentityNames(value) {
  return artistNameVariants(value, { identity: true })
}

// Retrieval hints only. A mixed-script band name is NOT automatically a solo
// identity. Scoring requires tight recording evidence and a single credit.
function joinedBilingualParts(value) {
  const full = String(value || '').normalize('NFKC').trim()
  const match = full.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,})([\p{Script=Latin}][\p{Script=Latin}\d]{2,})$/u) ||
    full.match(/^([\p{Script=Latin}][\p{Script=Latin}\d]{2,})([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,})$/u)
  return match ? match.slice(1) : []
}

function artistNameVariants(value, { identity = false } = {}) {
  const full = String(value || '').normalize('NFKC')
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '')
  // A bilingual display credit, e.g. 简约情人（Simple Lover), is one artist
  // with two names. Do not split same-script band qualifiers or edition text.
  const bilingual = titleVariants(full, { dashTranslations: false })
  const parts = full.split(/(?<=[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Latin}])|(?<=[\p{Script=Latin}])\s+(?=[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/u)
  if (identity) return unique([full, ...bilingual, ...parts])
  return unique([full, ...bilingual, ...parts, ...joinedBilingualParts(full), ...parts.flatMap(part => part.split(/\s*[,&]\s*/))])
}

// These are recording-level corroboration, NOT global aliases. A voice actor
// is not interchangeable with every role they perform, nor is one member of a
// combined credit proof of its entire roster.
function voiceCast(credits) {
  const parts = credits.flatMap(name => String(name).normalize('NFKC').split(/\s*、\s*/u))
  const cast = parts.map(name => name.match(/^[^()]+\(\s*CV\s*:\s*([^()]+)\)\s*$/iu)?.[1]?.trim())
  return cast.length && cast.every(Boolean) ? cast : []
}

function corroboratedCredit(song, candidate, { title, album, difference, manual }) {
  if (title < 0.98 || album < 0.98 || difference > 2500) return null
  const source = (song.ar || song.artists || []).map(artist => metadataNames(artist)
    .flatMap(name => [name, ...(manual ? catalogAliases(ARTIST_ALIASES, name) : [])]).flatMap(artistIdentityNames).map(normalize))
  const targets = (candidate.artists || []).map(artist => artist.name)
  const cast = voiceCast(targets)
  if (!voiceCast(songArtists(song)).length && cast.length === source.length && source.length) {
    const used = new Set()
    if (cast.every(name => {
      const names = [name, ...(manual ? catalogAliases(ARTIST_ALIASES, name) : [])].map(normalize)
      const index = source.findIndex((aliases, i) => !used.has(i) && names.some(n => aliases.includes(n)))
      if (index < 0) return false
      used.add(index); return true
    })) return 'complete-voice-cast'
  }
  // Only a single bilingual display credit, with exact source-name agreement
  // and tight recording evidence. Do not split AC/DC or multi-artist rosters.
  if (source.length === 1 && targets.length === 1) {
    const sourceNames = metadataNames((song.ar || song.artists)[0])
    if (sourceNames.some(name => joinedBilingualParts(name).some(part => normalize(part) === normalize(targets[0]))) ||
      joinedBilingualParts(targets[0]).some(part => source[0].includes(normalize(part)))) return 'joined-bilingual-credit'
    const parts = String(targets[0]).normalize('NFKC').split('/').map(s => s.trim())
    if (parts.length === 2 && differentScripts(parts[0], parts[1]) &&
      parts.every(part => !/[,、&()]/u.test(part)) &&
      parts.some(part => artistIdentityNames(part).some(name => source[0].includes(normalize(name))))) return 'bilingual-display-credit'
  }
  return null
}

function albumIdentity(value) {
  return normalize(String(value).replace(/\bVol\.?\s*(I{1,3}|IV|V)\b/gi,
    (_, roman) => `Vol ${['I', 'II', 'III', 'IV', 'V'].indexOf(roman.toUpperCase()) + 1}`))
    .replace(/\bvol\s*(\d+)/g, 'vol $1')
}

// Album traversal is bounded and only a retrieval hint. Every returned track
// still goes through the ordinary title/artist/version checks.
export function albumSearchQueries(song) {
  return [...new Set(metadataNames(song.al || song.album).slice(0, 2)
    .flatMap(name => [name, String(name).replace(/Vol\.?\s*1\b/gi, 'Vol.I')])
    .flatMap(name => [name, String(name).split(/[~〜～―]/u)[0].trim()])
    .map(name => `album:"${quoted(name)}"`))].slice(0, 2)
}

export function selectSourceAlbums(song, albums) {
  const names = metadataNames(song.al || song.album).map(albumIdentity)
  const artists = searchableArtists(song, { identity: true }).flatMap(artistIdentityNames).map(normalize)
  const volumes = names.map(name => name.match(/\bvol (\d+)/)?.[1]).filter(Boolean)
  const seen = new Set()
  return albums.filter(album => /^[a-zA-Z0-9]{22}$/.test(album?.id || ''))
    .filter(album => {
      if (seen.has(album.id)) return false
      seen.add(album.id)
      const volume = albumIdentity(album.name).match(/\bvol (\d+)/)?.[1]
      return !volume || !volumes.length || volumes.includes(volume)
    })
    .map(album => ({ album, score: Math.max(0, ...names.map(name => similarity(name, albumIdentity(album.name)))),
      artist: (album.artists || []).some(a => artistIdentityNames(a.name).some(n => artists.includes(normalize(n)))) }))
    .filter(item => item.score >= 0.9 && (item.artist || (item.score >= 0.98 && normalize(item.album.name).length >= 8)))
    .sort((a, b) => Number(b.artist) - Number(a.artist) || b.score - a.score)
    .slice(0, 2).map(item => item.album)
}

function withCredit(value) {
  const match = String(value).normalize('NFKC').match(/^(.*?)\s*\(with\s+([^()]+)\)\s*$/iu)
  return match ? { base: match[1].trim(), names: match[2].split(/\s*(?:,|&|\band\b)\s*/iu).filter(Boolean) } : null
}

function creditNames(value) {
  return [value, ...catalogAliases(ARTIST_ALIASES, value)].flatMap(artistIdentityNames).map(normalize)
}

// Only remove a delimited "with" credit if the named collaborator is present
// in that catalog's structured list, or both titles explicitly agree below.
function withoutCollaborator(value, artists = []) {
  const credit = withCredit(value)
  return credit?.names.length && credit.names.every(name => artists.some(artist =>
    creditNames(artist.name).some(alias => creditNames(name).includes(alias)))) ? credit.base : value
}

function titlePairs(song, candidate, options, transform) {
  return songTitles(song, options).flatMap(left => titleVariants(candidate.name).map(right => {
    const a = withCredit(left), b = withCredit(right)
    const remaining = b?.names.map(creditNames) || []
    // Exact complete suffix roster, not a shared guest or an arbitrary subtitle.
    const shared = a?.names.length && a.names.length === remaining.length && a.names.every(name => {
      const aliases = creditNames(name)
      const i = remaining.findIndex(names => names.some(alias => aliases.includes(alias)))
      if (i < 0) return false
      remaining.splice(i, 1); return true
    })
    return [transform(shared ? a.base : withoutCollaborator(left, song.ar || song.artists)),
      transform(shared ? b.base : withoutCollaborator(right, candidate.artists))]
  }))
}

function recordingTitle(value) {
  // Strip a clearly delimited edition suffix, not ordinary song subtitles.
  // Version compatibility is checked separately using title AND album context.
  return stripBracketedEditions(value).replace(/\s*(?:[-–—]|\()\s*(?:(?:19|20)\d{2}\s+)?(?:live|acoustic|unplugged|remaster(?:ed|ing)?)\b.*$/i, '').trim()
}

function quoted(value) {
  return String(value).replace(/["\\\r\n]/g, ' ').trim()
}

function searchTitle(value) {
  // Spotify free-text search understands aliases better than exact filters.
  // Remove feature credits from queries, but retain recording-version labels.
  return String(value).normalize('NFKC').replace(/\s*\(?\b(?:feat|featuring|ft)\b\.?\s+.*$/i, '').trim()
}

// Query-only shortening: a game/movie theme annotation is not part of the
// identifying title. Never strip arbitrary hyphenated titles or weaken scoring.
function retrievalTitles(value) {
  const original = searchTitle(value)
  // Retrieval-only cleanup. Do not erase these details from identity scoring.
  const full = original.replace(/\s*[【\[(](?:已售|已出售|sold)[】\])]\s*$/iu, '')
    .replace(/\s*(?:[-–—]\s*|\()(?:(?:19|20)\d{2}\s+)?remaster(?:ed|ing)?(?:\s+(?:19|20)\d{2})?\)?\s*$/iu, '')
    .replace(/\b(?:[a-z]\s+){3,}[a-z]\b/giu, part => part.replace(/\s/g, ''))
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '')
    .trim()
  const base = full.replace(/\s+[-–—]\s*.*(?:テーマ|theme\s+(?:of|from)|主題歌|主题曲|主題曲).*$/iu, '').trim()
  return [...new Set([full, ...(base !== full && normalize(base).replace(/\s/g, '').length >= 4 ? [base] : []), original])]
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

function interleave(groups) {
  const result = []
  for (let i = 0; i < Math.max(0, ...groups.map(group => group.length)); i++) {
    for (const group of groups) if (group[i]) result.push(group[i])
  }
  return result
}

export function songSearchStages(song) {
  // Bound fan-out on unusually verbose catalog metadata.
  const prioritizeNames = names => [...new Set([...names.map(searchTitle), ...queryVariants(names)])].filter(Boolean)
  const metadataTitles = songTitles(song, { manual: false })
  const coreTitles = metadataTitles.flatMap(value => {
    const bilingual = titleVariants(value)
    if (bilingual.length > 1) return bilingual.slice(1)
    const base = searchTitle(value).split(/[~〜～]/u)[0].trim()
    return base.length >= 4 && base !== searchTitle(value) ? [value, base] : retrievalTitles(value)
  })
  const titles = prioritizeNames([...coreTitles, ...metadataTitles]).slice(0, 12)
  const artists = prioritizeNames(searchableArtists(song, { manual: false })).slice(0, 4)
  // Try genuine translated titles with the primary credit before exhausting
  // glyph/artist permutations of only the first title.
  const combined = (names, credits) => interleave(names.map((title) => credits.map((artist) =>
    `track:"${quoted(title)}" artist:"${quoted(artist)}"`)))
  const titleOnly = (names) => names.map((title) => `track:"${quoted(title)}"`)
  const plain = (names, credits) => interleave([names.slice(0, 4).flatMap((title) =>
    credits.slice(0, 2).map((artist) => `${quoted(title)} ${quoted(artist)}`)), names])
  const fallbackTitles = queryVariants(songTitles(song)).slice(0, 16)
  const fallbackArtists = searchableArtists(song).slice(0, 8)
  const albums = queryVariants(metadataNames(song.al || song.album)).slice(0, 2)
  // Album filters can surface an original recording buried under many live
  // releases. These are retrieval hints, never exemptions from scoring.
  const albumQueries = (credits) => albums.flatMap(album => [
    ...credits.map(artist => `album:"${quoted(album)}" artist:"${quoted(artist)}"`),
    ...titles.slice(0, 4).map(title => `track:"${quoted(title)}" album:"${quoted(album)}"`),
    ...titles.slice(0, 2).map(title => `${quoted(title)} ${quoted(album)}`),
  ])
  const newArtists = fallbackArtists.filter(artist => !artists.includes(artist))
  const newTitles = songTitles(song).filter(title => !metadataTitles.includes(title))
  return [
    { name: 'metadata', manual: false, queries: combined(titles, artists) },
    { name: 'title-only', manual: false, queries: titleOnly(titles) },
    { name: 'free-text', manual: false, queries: plain(titles, artists) },
    { name: 'album', manual: false, queries: albumQueries(artists) },
    { name: 'manual-alias', manual: true, queries: interleave([
      combined(newTitles, fallbackArtists),
      combined(titles, newArtists), plain(titles, newArtists), albumQueries(newArtists),
      combined(fallbackTitles, fallbackArtists), titleOnly(fallbackTitles), plain(fallbackTitles, fallbackArtists),
    ]) },
  ].map(stage => {
    // A planned query is not an executed query. Cross-stage deduplication must
    // happen in findTrackMatch, after earlier budget/stagnation stops.
    const queries = [...new Set(stage.queries)]
    // Bound curated-name fan-out, with mixed query types rather than spending
    // the whole allowance on the Cartesian product of title/artist spellings.
    return { ...stage, queries: stage.manual ? queries.slice(0, 12) : queries,
      limited: stage.manual && queries.length > 12 }
  })
}

export function songSearchQueries(song) {
  return [...new Set(songSearchStages(song).flatMap((stage) => stage.queries))]
}

export function songAlbum(song) {
  return song.al?.name || song.album?.name || ''
}

export function songDuration(song) {
  return Number(song.dt || song.duration || 0)
}

// A combined credit can equal a structured roster only when EVERY component
// is independently present on both sides. A shared guest or '& Mink' is not
// evidence for a solo artist. Preserve the complete band identity elsewhere.
function sameCompleteRoster(sourceArtists, targetArtists, manual) {
  const expand = (credits, aliases) => credits.flatMap(name => String(name).split(/\s*[,&]\s*/))
    .filter(Boolean).map(name => unique([...artistIdentityNames(name), ...(aliases ? catalogAliases(ARTIST_ALIASES, name) : [])]).map(normalize))
  const left = expand(sourceArtists, manual)
  const right = expand(targetArtists, false)
  if (left.length < 2 || left.length !== right.length) return false
  const used = new Set()
  // Exact names/known aliases only; no fuzzy substring or cross-script guess.
  return left.every(names => {
    const index = right.findIndex((other, i) => !used.has(i) && names.some(name => other.includes(name)))
    if (index < 0) return false
    used.add(index)
    return true
  })
}

function evidence(song, candidate, options) {
  const targetTitles = titleVariants(withoutCollaborator(candidate.name, candidate.artists)).map(recordingTitle)
  const title = Math.max(0, ...titlePairs(song, candidate, options, recordingTitle).map(([left, right]) => similarity(left, right)))
  const artistOptions = options?.artistManual ? { ...options, manual: true } : options
  const neteaseArtists = searchableArtists(song, { ...artistOptions, identity: true })
  const spotifyArtists = (candidate.artists || []).map((artist) => artist.name)
  let artist = 0
  for (const left of neteaseArtists) {
    for (const right of spotifyArtists) {
      artist = Math.max(artist, ...artistIdentityNames(left).flatMap(credit => artistIdentityNames(right).map(target => similarity(credit, target))))
    }
  }
  if (sameCompleteRoster(songArtists(song), spotifyArtists, artistOptions?.manual !== false)) artist = 1
  const primary = primaryArtistNames(song, artistOptions)
  let primaryMatch = artistIdentityNames(spotifyArtists[0]).some(name => primary.includes(normalize(name)))
  const primarySimilarity = Math.max(0, ...primary.flatMap(name =>
    artistIdentityNames(spotifyArtists[0]).map(other => similarity(name, other))))
  const completeRoster = sameCompleteRoster(songArtists(song), spotifyArtists, artistOptions?.manual !== false)
  // A shared guest is not proof that this is the source artist's recording.
  // Reordered complete collaboration rosters are still allowed.
  let guestOnly = primarySimilarity < 0.85 && !completeRoster && artist >= 0.85

  const sourceDuration = songDuration(song)
  const targetDuration = Number(candidate.duration_ms || 0)
  const difference = sourceDuration && targetDuration ? Math.abs(sourceDuration - targetDuration) : Infinity
  const duration = difference <= 2500 ? 1 : difference <= 8000 ? 0.7 : difference <= 18000 ? 0.25 : 0
  const album = Math.max(0, ...metadataNames(song.al || song.album).flatMap(titleVariants)
    .flatMap(name => titleVariants(candidate.album?.name || '').map(target => similarity(name, target))))
  const identityEvidence = corroboratedCredit(song, candidate, { title, album, difference, manual: artistOptions?.manual !== false })
  if (identityEvidence) { artist = 1; primaryMatch = true; guestOnly = false }
  const crossScript = neteaseArtists.length > 0 && spotifyArtists.length > 0 &&
    neteaseArtists.every((left) => spotifyArtists.every((right) => differentScripts(left, right)))
  // An exact short/common title alone is not sufficient across unrelated credits.
  const distinctive = targetTitles.some((name) => {
    const length = normalize(name).replace(/\s/g, '').length
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(name) ? length >= 5 : length >= 8
  })
  // Once a curated primary identity exists, a differently spelled artist is
  // not rescued merely by script/duration coincidence (e.g. SPITZ covers).
  const primaryHasAlias = artistOptions?.manual !== false && metadataNames((song.ar || song.artists || [])[0])
    .some(name => catalogAliases(ARTIST_ALIASES, name).length > 0)
  const crossLanguage = !primaryHasAlias && crossScript && title >= 0.98 && difference <= 2500 && (album >= 0.75 || distinctive)
  const versionMismatch = recordingKinds(song.name, songAlbum(song)) !== recordingKinds(candidate.name, candidate.album?.name) ||
    Boolean(DIFFERENT_RECORDINGS.get(String(song.id))?.has(candidate.id))
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
  const eligible = !guestOnly && !versionMismatch && !creditConflict && durationCompatible && title >= 0.78 && (artist >= 0.85 || crossLanguage)
  const weighted = title * 0.56 + artist * 0.28 + duration * 0.12 + album * 0.04
  const score = Number(Math.max(weighted, crossLanguage ? 0.82 + album * 0.1 : 0).toFixed(4))
  const rejectionReasons = [
    ...(candidate.is_playable === false ? ['unplayable'] : []),
    ...(versionMismatch ? ['recording-version'] : []),
    ...(creditConflict ? ['guest-credits'] : []),
    ...(guestOnly ? ['guest-only-identity'] : []),
    ...(!durationCompatible ? ['duration'] : []),
    ...(title < 0.78 ? ['title'] : []),
    ...(artist < 0.85 && !crossLanguage ? ['artist-identity'] : []),
  ]
  return { title, artist, primaryMatch, identityEvidence, albumSimilarity: album, difference, crossLanguage, versionMismatch, creditConflict, eligible, score, rejectionReasons }
}

function recordingKinds(name = '', album = '') {
  const value = String(name).normalize('NFKC')
  const context = `${value} ${album}`.normalize('NFKC')
  return [
    /\blive\b|\bunplugged\b|现场|現場|ライブ/i.test(context),
    /\bacoustic\b|\bunplugged\b|不插电|不插電|アコースティック/i.test(context),
    ...[
    BACKING_TRACK,
    /\bremix\b|\bre-mix\b|リミックス/i,
    /\bsped\s*up\b|\bslowed\b/i,
    /\boriginal\s+ver(?:sion)?\b/i,
    /\bbootleg\b/i,
    /\bmashup\b/i,
  ].map(pattern => pattern.test(value)),
    hasMixEdition(value),
  ].map(Number).join('')
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

function strongerSourceEvidence(best, rival) {
  const a = best.candidate, b = rival.candidate
  const names = candidate => (candidate.artists || []).map(artist => normalize(artist.name)).sort().join('|')
  // A source-aligned release can outrank a remaster/compilation with the same
  // complete credits and recording title. This is a preference, not a claim
  // that all reissues share an ISRC; ties and conflicting recordings stay open.
  if (best.primaryMatch && rival.primaryMatch && best.title >= 0.98 && rival.title >= 0.98 &&
    names(a) && names(a) === names(b) && recordingKinds(a.name, a.album?.name) === recordingKinds(b.name, b.album?.name) &&
    normalize(recordingTitle(a.name)) === normalize(recordingTitle(b.name)) &&
    best.albumSimilarity >= 0.98 && rival.albumSimilarity < 0.98 &&
    best.difference <= 250 && best.difference <= rival.difference && rival.difference <= 2500) return true
  if (best.primaryMatch && rival.primaryMatch && best.title >= 0.98 && rival.title >= 0.98 &&
    best.difference <= 2500 && rival.difference <= 2500 && best.difference <= rival.difference + 1000 &&
    best.albumSimilarity >= 0.98 && rival.albumSimilarity < 0.75 &&
    artistIdentityNames(best.candidate.artists?.[0]?.name).some(name =>
      artistIdentityNames(rival.candidate.artists?.[0]?.name).some(other => normalize(name) === normalize(other)))) return true
  const credits = candidate => (candidate.artists || []).map(artist => artist.id).filter(Boolean).sort().join('|')
  // A near-exact source duration PLUS closer album metadata can disambiguate
  // reissues by the same credited artists. Do not collapse them as identical,
  // and never use this for another artist, unknown IDs, or equal album evidence.
  return best.title >= 0.98 && rival.title >= 0.98 && best.artist >= 0.98 && rival.artist >= 0.98 &&
    credits(best.candidate) && credits(best.candidate) === credits(rival.candidate) &&
    best.candidate.artists.every(artist => artist.id) && rival.candidate.artists.every(artist => artist.id) &&
    best.difference <= 250 && rival.difference >= 2500 && rival.difference <= 8000 &&
    best.albumSimilarity > rival.albumSimilarity && best.score > rival.score
}

export function pickBestMatch(song, candidates, threshold = 0.68, options = {}) {
  const ranked = candidates.filter((candidate) => candidate && candidate.is_playable !== false)
    .map((candidate) => ({ candidate, ...evidence(song, candidate, options) }))
    .filter((match) => match.eligible && match.score >= threshold)
    .sort((left, right) => right.score - left.score || left.difference - right.difference ||
      String(left.candidate.id).localeCompare(String(right.candidate.id)))
  const best = ranked[0]
  if (!best) return null
  // Duplicated releases are fine; competing recordings need a clear winner.
  const ambiguous = ranked.some(match => !compatibleRelease(best, match, song) &&
    best.score - match.score < 0.05 && !strongerSourceEvidence(best, match))
  if (ambiguous) return null
  return best
}

const BACKING_TRACK = /\binstrumental\b|\binstrument\s+mix\b|\bkaraoke\b|\b(?:less|off)[ -]?vocals?\b|伴奏|カラオケ|ボーカルレス/i
const VERSION_LABEL = /\b(?:live|acoustic|unplugged|remaster\w*|remix|re-mix|bootleg|mashup|instrumental|karaoke|(?:less|off)[ -]?vocals?|extended|radio\s+edit|edit|version|ver\.?|sped\s*up|slowed)\b|现场|現場|ライブ|不插电|不插電|伴奏|カラオケ|ボーカルレス|リミックス|アコースティック/i
// Bounded, complete labels only: never erase a subtitle merely containing mix.
const MIX_EDITION = /^(?:instrument(?:al)?|after[ -]hours|club|dance|extended|dub|vocal|radio|original|single|album)\s+mix$/i

function hasMixEdition(value) {
  return [...String(value).matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】|<([^<>]*)>|〈([^〈〉]*)〉|《([^《》]*)》|\s[-–—]\s*([^()\[\]]+)$/gu)]
    .some(parts => parts.slice(1).some(part => part && MIX_EDITION.test(part.trim())))
}

function stripBracketedEditions(value) {
  return String(value).normalize('NFKC')
    // Limit typo tolerance to a complete, clearly delimited edition label.
    // Never truncate ordinary ~subtitles~ or arbitrary words ending in ver.
    .replace(/\s*[~〜]\s*(?:album|single|original|studio)\s+(?:version|verion|ver\.?)\s*[~〜]\s*$/iu, '')
    .replace(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】|<([^<>]*)>|〈([^〈〉]*)〉|《([^《》]*)》/gu,
      (full, ...parts) => parts.slice(0, 6).some(part => part && (VERSION_LABEL.test(part) || MIX_EDITION.test(part.trim()))) ? ' ' : full)
}

function compositionTitle(value) {
  return stripBracketedEditions(searchTitle(value))
    .replace(/\s+[-–—]\s*([^()\[\]]+)$/u, (full, label) => MIX_EDITION.test(label.trim()) ? '' : full)
    // Accept compact edition delimiters such as " -band ver-" or "—Live".
    // Do not strip ordinary hyphenated titles or subtitles containing "live".
    .replace(/\s*[-–—]\s*((?:(?:19|20)\d{2}\s+)?(?:band\s+ver(?:sion)?\.?|live|acoustic|unplugged|remaster\w*|remix|re-mix|bootleg|mashup|instrumental|karaoke|extended|radio\s+edit|edit|version|ver\.?|sped\s*up|slowed)\b.*)$/iu, '')
    .replace(/\s*[-–—]\s*(?:现场|現場|ライブ|不插电|不插電|伴奏|カラオケ|リミックス|アコースティック).*$/u, '')
    .trim()
}

// Recall-first second pass: explicit same primary artist + exact composition
// title. Duration and edition become ranking hints, not rejection gates.
// A shared guest credit or unknown cross-script identity is NOT sufficient.
export function pickAlternateVersion(song, candidates, { manual = true, artistManual = manual } = {}) {
  const primary = (song.ar || song.artists || [])[0]
  if (!primary) return null
  const primaryNames = primaryArtistNames(song, { manual: artistManual })
  const ranked = candidates.filter(candidate => candidate && candidate.is_playable !== false)
    // A different vocal performance is allowed; a backing track is not a
    // substitute for a sung recording, even with identical artist and duration.
    .filter(candidate => BACKING_TRACK.test(String(song.name).normalize('NFKC')) === BACKING_TRACK.test(String(candidate.name).normalize('NFKC')))
    .filter(candidate => artistIdentityNames(candidate.artists?.[0]?.name).some(name => primaryNames.includes(normalize(name))))
    .filter(candidate => titlePairs(song, candidate, { manual }, compositionTitle)
      .some(([left, right]) => normalize(left) && normalize(left) === normalize(right)))
    .map(candidate => ({ candidate, ...evidence(song, candidate, { manual, artistManual }) }))
    .sort((a, b) => Number(a.versionMismatch) - Number(b.versionMismatch) ||
      a.difference - b.difference || b.albumSimilarity - a.albumSimilarity ||
      String(a.candidate.id).localeCompare(String(b.candidate.id)))
  const best = ranked[0]
  return best ? {
    ...best, eligible: true, alternateVersion: true, searchStage: 'alternate-version',
    substitutionReasons: best.rejectionReasons.length ? best.rejectionReasons : ['competing-versions'],
  } : null
}

export const MAX_SONG_CATALOG_QUERIES = 18
const STAGE_QUERY_LIMITS = { 'known-track': 1, metadata: 3, 'title-only': 2, 'free-text': 2, album: 1, 'album-traversal': 3, 'manual-alias': 4, 'second-pass': 3, 'budget-recovery': MAX_SONG_CATALOG_QUERIES }

export async function findTrackMatch(song, searchTracks, diagnostics = null, { allowAlternateVersions = false, findAlbumTracks, findKnownTracks, knownIds = knownTrackIds(song), maxQueries = MAX_SONG_CATALOG_QUERIES } = {}) {
  const candidates = new Map()
  const searched = new Set()
  const evidenceSeen = new Set()
  let queryCount = 0
  let catalogQueryCount = 0
  let albumTraversalChecked = false
  let queryLimitsApplied = false
  const stageCounts = {}
  const stoppedStages = []
  const queryTrace = []
  let knownTrackStatus = 'not-checked'
  let identityReviewRequired = false
  const limit = Number.isFinite(maxQueries) ? Math.max(0, Math.min(MAX_SONG_CATALOG_QUERIES, Math.floor(maxQueries))) : MAX_SONG_CATALOG_QUERIES
  const takeQuery = stage => {
    if (catalogQueryCount >= limit || (stageCounts[stage] || 0) >= STAGE_QUERY_LIMITS[stage]) {
      queryLimitsApplied = true
      return false
    }
    catalogQueryCount++
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
    return true
  }
  const addCandidates = items => {
    let changed = false
    for (const candidate of items) {
      if (!candidate) continue
      const key = candidate.id || candidate.uri || JSON.stringify(candidate)
      // An existing ID with better metadata is also new evidence.
      const previous = candidates.get(key)
      // A search response without availability must not erase a known denial
      // for the same Spotify ID. An explicitly playable relink/reissue can win.
      const merged = previous?.is_playable === false && candidate.is_playable !== true
        ? { ...candidate, is_playable: false } : candidate
      // Ignore artwork, popularity and response-shape churn. Count only a new
      // plausible candidate or an improvement in actual matching evidence.
      const before = previous && evidence(song, previous, { manual: true })
      const after = evidence(song, merged, { manual: true })
      const plausible = after.title >= 0.78 || after.artist >= 0.85 || after.albumSimilarity >= 0.9
      // A new ID for another equally weak cover is not improved identity
      // evidence. Keep it for ambiguity checks, but do not reset stagnation.
      const band = (value, levels) => levels.filter(level => value >= level).length
      const signature = JSON.stringify([band(after.title, [0.78, 0.98]), band(after.artist, [0.85, 0.98]),
        band(after.albumSimilarity, [0.75, 0.98]), band(after.difference, [251, 2501, 8001, 18001]),
        after.primaryMatch, after.eligible, after.versionMismatch, merged.is_playable !== false])
      if (plausible && ((!before && !evidenceSeen.has(signature)) || (before && (after.title > before.title || after.artist > before.artist ||
        after.albumSimilarity > before.albumSimilarity || after.difference < before.difference ||
        (!before.eligible && after.eligible) || (previous.is_playable !== true && merged.is_playable === true))))) changed = true
      if (plausible) evidenceSeen.add(signature)
      candidates.set(key, merged)
    }
    return changed
  }
  const finish = match => {
    const usage = { queryCount, catalogQueryCount, albumQueryCount: stageCounts['album-traversal'] || 0,
      knownTrackQueryCount: stageCounts['known-track'] || 0, knownTrackStatus,
      queryBudget: limit, queryLimitsApplied, identityReviewRequired, stageQueryCounts: { ...stageCounts }, stoppedStages: [...stoppedStages], queryTrace: [...queryTrace] }
    if (diagnostics) Object.assign(diagnostics, usage)
    return { ...match, searchDiagnostics: usage }
  }
  const confident = (stage, earlyExit = false) => {
    // Known artist identities can resolve an already-retrieved candidate now;
    // translated/manual TITLE searches still remain a last resort.
    const match = pickBestMatch(song, [...candidates.values()], 0.68, { manual: stage.manual, artistManual: true })
    const samePrimary = match?.primaryMatch
    // Album names may differ on a compilation. A unique strict same-primary
    // match with exact title and near-exact duration does not need more queries.
    if (match && samePrimary && !match.crossLanguage && match.title >= 0.98 && match.difference <= 2500) {
      return finish({ ...match, searchStage: stage.name, earlyExit })
    }
    return null
  }
  if (findKnownTracks && knownIds.length) {
    const items = await findKnownTracks(song, { ids: knownIds, takeQuery: () => takeQuery('known-track') })
    addCandidates(items)
    knownTrackStatus = !stageCounts['known-track'] ? 'budget-deferred' : !items.length ? 'not-found' :
      items.some(item => item.catalogAvailability === 'unknown') ? 'availability-unknown' :
      items.every(item => item.is_playable === false) ? 'unplayable' : 'returned'
    // The pointer is source-scoped and freshly fetched. Reviewed translations
    // can validate this returned recording without repeating failed searches.
    const known = confident({ name: 'known-track', manual: true }, true)
    if (known) return known
    // Even an unavailable known recording may have a playable reissue. Continue
    // normal bounded retrieval; never let a public pointer bypass validation.
  }
  const stages = songSearchStages(song)
  for (const stage of stages) {
    // A track may be beyond the first ten album-filtered search results. Read
    // a bounded album listing before more query permutations, without treating
    // album membership or similar duration as proof of an unrelated title.
    if (stage.name === 'album' && findAlbumTracks) {
      albumTraversalChecked = true
      addCandidates(await findAlbumTracks(song, { takeQuery: () => takeQuery('album-traversal') }))
      const found = pickBestMatch(song, [...candidates.values()], 0.68, { manual: false, artistManual: true })
      if (found) return finish({ ...found, searchStage: 'album-traversal' })
    }
    // Re-score retrieved candidates with curated names before spending more
    // requests. Aliases remain a last resort, after every metadata stage.
    if (stage.manual) {
      const existing = pickBestMatch(song, [...candidates.values()], 0.68, { manual: true })
      if (existing) return finish({ ...existing, searchStage: stage.name })
      // All metadata stages already failed. Reuse the retrieved pool with the
      // reviewed identities before issuing any more alias/version searches.
      if (allowAlternateVersions) {
        const alternate = pickAlternateVersion(song, [...candidates.values()])
        if (alternate) return finish(alternate)
      }
    }
    let stagnant = 0
    for (const query of stage.queries) {
      if (searched.has(query)) continue
      if (!takeQuery(stage.name)) { stoppedStages.push({ stage: stage.name, reason: 'query-budget' }); break }
      searched.add(query)
      queryCount++
      const changed = addCandidates(await searchTracks(query, 10))
      queryTrace.push({ stage: stage.name, query, newEvidence: changed })
      stagnant = changed ? 0 : stagnant + 1
      const definite = confident(stage, true)
      if (definite) return definite
      if (stagnant >= 2) {
        stoppedStages.push({ stage: stage.name, reason: 'no-new-candidates' })
        queryLimitsApplied ||= stage.queries.some(q => !searched.has(q))
        break
      }
    }
    // Assess the whole stage, not the first vaguely plausible search result.
    const pool = [...candidates.values()]
    const match = pickBestMatch(song, pool, 0.68, { manual: stage.manual, artistManual: true })
    // An artist-filtered query may still return unrelated credits. Broaden the
    // search before choosing a cross-language match so rivals can be compared.
    if (match?.crossLanguage && stage.name === 'metadata') continue
    if (match) return finish({ ...match, searchStage: stage.name })
    // After both artist-filtered and title-only retrieval have had a chance,
    // the user's same-song/same-primary-artist alternative is sufficient.
    if (allowAlternateVersions && stage.name !== 'metadata') {
      const alternate = pickAlternateVersion(song, pool, { manual: stage.manual, artistManual: true })
      if (alternate) {
        // Before settling for a different edition, re-score the SAME pool with
        // verified credits. No extra search: a closer known recording may
        // already be present under a localized or source-scoped band credit.
        const reviewed = pickBestMatch(song, pool, 0.68, { manual: true }) || pickAlternateVersion(song, pool)
        return finish(reviewed ? { ...reviewed, searchStage: reviewed.searchStage || 'verified-pool' } : alternate)
      }
    }
  }
  if (allowAlternateVersions) {
    // Reuse ALL retrieved candidates, not only the five diagnostic previews.
    const existing = pickAlternateVersion(song, [...candidates.values()])
    if (existing) return finish(existing)
    const titles = unique(songTitles(song).map(compositionTitle)).slice(0, 3)
    const primary = (song.ar || song.artists || [])[0]
    const artists = searchableArtists({ ...song, ar: primary ? [primary] : [] }).slice(0, 2)
    const queries = [...new Set(titles.flatMap(title => [
      ...artists.map(artist => `${quoted(title)} ${quoted(artist)}`),
      `track:"${quoted(title)}"`,
    ]))].filter(query => !searched.has(query)).slice(0, 6)
    for (const query of queries) {
      if (!takeQuery('second-pass')) { stoppedStages.push({ stage: 'second-pass', reason: 'query-budget' }); break }
      searched.add(query)
      queryCount++
      const changed = addCandidates(await searchTracks(query, 10))
      queryTrace.push({ stage: 'second-pass', query, newEvidence: changed })
      const definite = confident({ name: 'second-pass-strict', manual: true }, true)
      if (definite) return definite
    }
    // New retrieval might find an exact edition after all: still prefer it.
    const strict = pickBestMatch(song, [...candidates.values()])
    if (strict) return finish({ ...strict, searchStage: 'second-pass-strict' })
    const alternate = pickAlternateVersion(song, [...candidates.values()])
    if (alternate) return finish(alternate)
  }
  // First give every strategy its reserved opportunity. Then reuse unused
  // slots for actually-unexecuted queries, prioritizing identity/album-guided
  // retrieval. This shares the SAME 18-query ceiling, never an extra budget.
  // Once all dedicated strategies (including aliases and alternate versions)
  // have run, rephrasing queries cannot prove an unknown artist identity.
  // Leave these strong-but-blocked candidates for review, not a forced match
  // or a claim of catalog absence. Pure retrieval misses retain recovery.
  identityReviewRequired = [...candidates.values()].some(candidate => {
    const item = evidence(song, candidate, { manual: true })
    return candidate.is_playable !== false && item.title >= 0.98 && item.difference <= 2500 &&
      item.rejectionReasons.some(reason => ['artist-identity', 'guest-only-identity'].includes(reason))
  })
  if (identityReviewRequired) {
    queryLimitsApplied = true
    stoppedStages.push({ stage: 'budget-recovery', reason: 'identity-review-required' })
  }
  const recoveryStages = (identityReviewRequired ? [] : ['manual-alias', 'album', 'free-text', 'metadata', 'title-only'])
    .map(name => stages.find(stage => stage.name === name))
  // This is one final recovery pass, not a fresh stagnation allowance for each
  // syntax. Dedicated strategies above already had their reserved chances.
  let recoveryStagnant = 0
  for (const stage of recoveryStages) {
    let stagnant = 0
    for (const query of stage.queries) {
      if (searched.has(query)) continue
      if (!takeQuery('budget-recovery')) break
      searched.add(query)
      queryCount++
      const changed = addCandidates(await searchTracks(query, 10))
      queryTrace.push({ stage: `recovery-${stage.name}`, query, newEvidence: changed })
      recoveryStagnant = changed ? 0 : recoveryStagnant + 1
      stagnant = changed ? 0 : stagnant + 1
      const definite = confident({ name: 'budget-recovery', manual: true }, true)
      if (definite) return definite
      if (stagnant >= 2 || (candidates.size && recoveryStagnant >= 2)) break
    }
    const pool = [...candidates.values()]
    const match = pickBestMatch(song, pool) || (allowAlternateVersions && pickAlternateVersion(song, pool))
    if (match) return finish({ ...match, searchStage: match.searchStage || 'budget-recovery' })
    if (candidates.size && recoveryStagnant >= 2) {
      queryLimitsApplied = true
      stoppedStages.push({ stage: 'budget-recovery', reason: 'no-new-evidence' })
      break
    }
    if (catalogQueryCount >= limit) break
  }
  queryLimitsApplied ||= stages.some(stage => stage.limited)
  finish({})
  if (diagnostics) Object.assign(diagnostics, {
    alternateVersionChecked: allowAlternateVersions,
    albumTraversalChecked,
    queryLimitsApplied,
    reviewRequired: queryLimitsApplied,
    reviewReasons: [
      ...(identityReviewRequired ? ['identity-review-required'] : []),
      ...(queryLimitsApplied ? ['limited-retrieval'] : []),
      ...(knownTrackStatus === 'unplayable' ? ['known-recording-unplayable'] : []),
      ...(knownTrackStatus === 'availability-unknown' ? ['known-availability-unconfirmed'] : []),
      ...([...candidates.values()].some(c => evidence(song, c, { manual: true }).rejectionReasons.includes('artist-identity')) ? ['artist-identity-unconfirmed'] : []),
    ],
    reason: [...candidates.values()].some(candidate => candidate.is_playable !== false && evidence(song, candidate, { manual: true }).eligible) ? 'ambiguous-recordings' : candidates.size ? 'no-eligible-candidate' : 'no-results',
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
    // Keep safe catalog metadata for offline replay; never include cookies.
    titles: metadataNames(song),
    artistNames: (song.ar || song.artists || []).map(metadataNames),
    albumNames: metadataNames(song.al || song.album),
  }
}
