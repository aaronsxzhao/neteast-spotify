import { createHash } from 'node:crypto'

// Only a retrieval hint: every use goes through a fresh, budgeted Spotify ID
// lookup and the current matcher. Never cache misses or reuse a stale verdict.
const VERSION = 1
const TTL = 30 * 24 * 60 * 60_000
const LIMIT = 400
const keyFor = source => createHash('sha256').update(JSON.stringify(source)).digest('hex')
const scopeFor = state => `${state.settings.spotifyClientId || ''}:${state.sync.playlistId || ''}`

export function cachedTrackIds(state, source, now = Date.now()) {
  const cache = state.sync.confirmedTrackHints
  if (cache?.version !== VERSION || cache.scope !== scopeFor(state)) return []
  const entry = cache.entries?.[keyFor(source)]
  return entry && Number.isFinite(entry.at) && entry.at <= now && now - entry.at < TTL &&
    /^[a-zA-Z0-9]{22}$/.test(entry.id) ? [entry.id] : []
}

export function saveTrackHints(state, matches, unmatched, now = Date.now()) {
  const previous = state.sync.confirmedTrackHints
  const entries = previous?.version === VERSION && previous.scope === scopeFor(state) ? { ...previous.entries } : {}
  for (const miss of unmatched) {
    const { diagnostics, ...source } = miss
    delete entries[keyFor(source)]
  }
  for (const match of matches) {
    if (match.searchStage === 'same-day-confirmed') continue
    if (/^[a-zA-Z0-9]{22}$/.test(match.spotify?.id) &&
      match.spotify.uri === `spotify:track:${match.spotify.id}`) {
      entries[keyFor(match.source)] = { id: match.spotify.id, at: now }
    }
  }
  state.sync.confirmedTrackHints = { version: VERSION, scope: scopeFor(state), entries: Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => Number.isFinite(entry.at) && entry.at <= now && now - entry.at < TTL)
      .sort((a, b) => b[1].at - a[1].at).slice(0, LIMIT)) }
}
