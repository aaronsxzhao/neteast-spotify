import { getDailyRecommendations } from './netease.js'
import { findTrackMatch, sourceSongView } from './matcher.js'
import { createHash } from 'node:crypto'

export function dateInTimezone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function hourInTimezone(timezone, date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date))
}

function sameSource(left, right) {
  return left.id === right.id && left.name === right.name && left.album === right.album &&
    left.durationMs === right.durationMs && JSON.stringify(left.artists) === JSON.stringify(right.artists)
}

export class SyncService {
  #running = null

  constructor(store, spotify, getRecommendations = getDailyRecommendations) {
    this.store = store
    this.spotify = spotify
    this.getRecommendations = getRecommendations
  }

  run(options = {}) {
    if (this.#running) return this.#running
    this.#running = this.#run(options).finally(() => { this.#running = null })
    return this.#running
  }

  async #run({ scheduled = false, requireExistingPlaylist = false, rejectEmptyMatches = false, retryUnmatched = false, retrySourceIds = [] } = {}) {
    const { settings, sync } = this.store.state
    const date = dateInTimezone(settings.timezone)
    if (scheduled && sync.lastSyncedDate === date) return { skipped: true, reason: 'already-synced' }
    this.spotify.safety?.check()
    this.spotify.safety?.beginRun()
    if (!settings.neteaseCookie) throw new Error('Save a NetEase cookie first')
    if (!this.store.state.spotify.refreshToken) throw new Error('Connect Spotify first')
    if (requireExistingPlaylist && !sync.playlistId) throw new Error('Configure the existing Spotify playlist ID')

    const startedAt = new Date().toISOString()
    if (scheduled) {
      await this.store.update((data) => { data.sync.lastScheduledAttemptAt = Date.now() })
    }
    try {
      const songs = await this.getRecommendations(settings.neteaseCookie)
      const signature = createHash('sha256').update(JSON.stringify({ version: 1, date,
        playlistId: sync.playlistId, songs: songs.map(sourceSongView), retryUnmatched, retrySourceIds })).digest('hex')
      if (sync.checkpoint?.signature !== signature) {
        await this.store.update(state => {
          state.sync.checkpoint = { signature, date, completed: 0, matches: [], unmatched: [] }
          state.sync.searchCache = {}
        })
      }
      const checkpoint = this.store.state.sync.checkpoint
      const matches = [...checkpoint.matches]
      const unmatched = [...checkpoint.unmatched]
      const saveProgress = async completed => {
        await this.store.update(state => {
          state.sync.checkpoint = { signature, date, completed, matches: [...matches], unmatched: [...unmatched] }
          state.sync.searchCache = {}
        })
      }
      const previous = sync.lastSuccessfulRun
      const sameDayRepair = retryUnmatched && previous?.date === date && previous.playlistId === sync.playlistId
      const reusable = sameDayRepair ? previous.matches || [] : []
      const selected = new Set(retrySourceIds.map(String))

      for (let index = checkpoint.completed; index < songs.length; index++) {
        const song = songs[index]
        const source = sourceSongView(song)
        // Explicit repair mode only: keep today's already confirmed entries,
        // but re-search if any identity field changed. Never reuse misses.
        const cached = reusable.find(match => sameSource(match.source, source) &&
          match.spotify?.uri?.startsWith('spotify:track:'))
        if (cached) {
          matches.push({ ...cached, source, searchStage: 'same-day-confirmed' })
          await saveProgress(index + 1)
          continue
        }
        const deferred = sameDayRepair && selected.size && !selected.has(String(song.id)) &&
          previous.unmatched?.find(miss => sameSource(miss, source))
        if (deferred) {
          unmatched.push({ ...deferred, ...source })
          await saveProgress(index + 1)
          continue
        }
        const diagnostics = {}
        const match = await findTrackMatch(song, (query, limit) => this.spotify.searchTracks(query, limit), diagnostics, { allowAlternateVersions: true })

        if (match) {
          matches.push({
            source: sourceSongView(song),
            spotify: {
              id: match.candidate.id,
              uri: match.candidate.uri,
              name: match.candidate.name,
              artists: (match.candidate.artists || []).map((artist) => artist.name),
              url: match.candidate.external_urls?.spotify,
              image: match.candidate.album?.images?.at(-1)?.url,
              album: match.candidate.album?.name,
              durationMs: match.candidate.duration_ms,
            },
            score: match.score,
            searchStage: match.searchStage,
            alternateVersion: Boolean(match.alternateVersion),
            substitutionReasons: match.substitutionReasons || [],
          })
        } else {
          unmatched.push({ ...sourceSongView(song), diagnostics })
        }
        await saveProgress(index + 1)
      }

      if (rejectEmptyMatches && matches.length === 0) throw new Error('No confident matches; keeping the existing playlist')

      let playlistId = sync.playlistId
      let playlistUrl = sync.playlistUrl
      if (!playlistId) {
        const playlist = await this.spotify.createPlaylist(settings.playlistName, settings.playlistPublic)
        playlistId = playlist.id
        playlistUrl = playlist.external_urls?.spotify
      }

      try {
        await this.spotify.replacePlaylist(playlistId, matches.map((match) => match.spotify.uri))
      } catch (error) {
        if (error.status !== 404 || requireExistingPlaylist) throw error
        const playlist = await this.spotify.createPlaylist(settings.playlistName, settings.playlistPublic)
        playlistId = playlist.id
        playlistUrl = playlist.external_urls?.spotify
        await this.spotify.replacePlaylist(playlistId, matches.map((match) => match.spotify.uri))
      }

      const alternateVersionCount = matches.filter(match => match.alternateVersion).length
      await this.spotify.updatePlaylist(playlistId, {
        name: settings.playlistName,
        public: settings.playlistPublic,
        description: `NetEase daily recommendations for ${date}. Matched ${matches.length} of ${songs.length} tracks.${alternateVersionCount ? ` Includes ${alternateVersionCount} alternate versions by the same artists.` : ''}`,
      })

      const run = {
        ok: true,
        date,
        startedAt,
        finishedAt: new Date().toISOString(),
        sourceCount: songs.length,
        matchedCount: matches.length,
        unmatchedCount: unmatched.length,
        alternateVersionCount,
        matches,
        unmatched,
        playlistId,
        playlistUrl,
      }
      await this.store.update((data) => {
        data.sync.playlistId = playlistId
        data.sync.playlistUrl = playlistUrl
        data.sync.lastSyncedDate = date
        data.sync.lastRun = run
        data.sync.lastSuccessfulRun = run
        delete data.spotify.retryAfterUntil
        delete data.spotify.retryNotBefore
        delete data.spotify.pauseReason
        delete data.spotify.transientFailures
        delete data.sync.checkpoint
        delete data.sync.searchCache
        data.sync.history = [run, ...(data.sync.history || [])].slice(0, 14)
      })
      return run
    } catch (error) {
      const run = {
        ok: false,
        date,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error.message,
      }
      await this.store.update((data) => {
        data.sync.lastRun = run
        data.sync.history = [run, ...(data.sync.history || [])].slice(0, 14)
      })
      throw error
    }
  }

  shouldRun(date = new Date()) {
    const { settings, spotify, sync } = this.store.state
    if (!settings.scheduleEnabled) return false
    if (!settings.neteaseCookie || !spotify.refreshToken) return false
    const today = dateInTimezone(settings.timezone, date)
    const attemptedRecently = Date.now() - Number(sync.lastScheduledAttemptAt || 0) < 60 * 60_000
    return !attemptedRecently && sync.lastSyncedDate !== today && hourInTimezone(settings.timezone, date) >= settings.scheduleHour
  }
}
