import { dateInTimezone } from './sync.js'

// Hourly recovery runs only act on a persisted cooldown. They must not move
// the normal morning sync to midnight or re-fetch an already successful day.
export async function runCloudSync(sync, { force = false, recoveryOnly = false, retryUnmatched = false } = {}, now = new Date()) {
  const { spotify, settings, sync: status } = sync.store.state
  const retryAt = Number(spotify.retryAfterUntil || 0)
  if (retryAt > now.getTime()) {
    return { skipped: true, reason: 'provider-cooldown', retryAt: new Date(retryAt).toISOString() }
  }
  const recoveryPending = Number.isFinite(retryAt) && retryAt > 0
  if (recoveryOnly && !recoveryPending) return { skipped: true, reason: 'no-pending-recovery' }
  if (!force && !recoveryPending && status.lastSyncedDate === dateInTimezone(settings.timezone, now)) {
    return { skipped: true, reason: 'already-synced' }
  }
  // A failed forced update may follow a successful sync on the same day.
  // Its pending cooldown still needs one recovery, cleared only on success.
  return sync.run({ scheduled: !force && !recoveryPending, requireExistingPlaylist: true, rejectEmptyMatches: true, ...(retryUnmatched ? { retryUnmatched: true } : {}) })
}

export function cloudRunSummary(run) {
  if (!run.skipped) return `Synced ${run.matchedCount} of ${run.sourceCount} tracks for ${run.date}.`
  if (run.reason === 'provider-cooldown') return `Waiting for provider cooldown until ${run.retryAt}; no music-provider requests made. Hourly recovery will retry after expiry.`
  if (run.reason === 'no-pending-recovery') return 'No pending cooldown recovery; no music-provider requests made.'
  return 'Already synced today; no playlist changes.'
}
