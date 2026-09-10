import { dateInTimezone, hourInTimezone } from './sync.js'

// Hourly checks also catch a missed daily schedule after 08:00 local time.
// They must not move the normal morning sync to midnight or repeat a success.
export async function runCloudSync(sync, { force = false, recoveryOnly = false, retryUnmatched = false, retrySourceIds = [] } = {}, now = new Date()) {
  const { spotify, settings, sync: status } = sync.store.state
  const retryAt = Number(spotify.retryAfterUntil || 0)
  if (retryAt > now.getTime()) {
    return { skipped: true, reason: 'provider-cooldown', retryAt: new Date(retryAt).toISOString() }
  }
  const recoveryPending = Number.isFinite(retryAt) && retryAt > 0
  if (!force && !recoveryPending && status.lastSyncedDate === dateInTimezone(settings.timezone, now)) {
    return { skipped: true, reason: 'already-synced' }
  }
  if (recoveryOnly && !recoveryPending && hourInTimezone(settings.timezone, now) < 8) {
    return { skipped: true, reason: 'before-daily-window' }
  }
  // A failed forced update may follow a successful sync on the same day.
  // Its pending cooldown still needs one recovery, cleared only on success.
  return sync.run({ scheduled: !force && !recoveryPending, requireExistingPlaylist: true, rejectEmptyMatches: true, ...(retryUnmatched ? { retryUnmatched: true, retrySourceIds } : {}) })
}

export function cloudRunSummary(run) {
  if (!run.skipped) return `Synced ${run.matchedCount} of ${run.sourceCount} tracks for ${run.date}.${run.alternateVersionCount ? ` Includes ${run.alternateVersionCount} alternate versions by the same artists.` : ''}`
  if (run.reason === 'provider-cooldown') return `Waiting for provider cooldown until ${run.retryAt}; no music-provider requests made. Hourly recovery will retry after expiry.`
  if (run.reason === 'before-daily-window') return 'Before 08:00 local time; no pending cooldown recovery. Daily catch-up will be checked after 08:00; no music-provider requests made.'
  return 'Already synced today; no playlist changes.'
}
