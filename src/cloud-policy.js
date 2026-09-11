import { dateInTimezone, hourInTimezone } from './sync.js'

// Frequent recovery checks also catch a missed daily schedule after 07:00 local time.
// They must not move the normal morning sync to midnight or repeat a success.
export async function runCloudSync(sync, { force = false, recoveryOnly = false, retryUnmatched = false, retrySourceIds = [], onDecision = () => {} } = {}, now = new Date()) {
  const decision = details => { try { onDecision(details) } catch { /* Logging cannot affect policy. */ } }
  const skip = details => { decision({ result: 'skipped', ...details }); return { skipped: true, ...details } }
  const { spotify, settings, sync: status } = sync.store.state
  const retryAt = Number(spotify.retryAfterUntil || 0)
  if (retryAt > now.getTime()) {
    return skip({ reason: 'provider-cooldown', retryAt: new Date(retryAt).toISOString() })
  }
  const localRetryAt = Number(spotify.retryNotBefore || 0)
  if (localRetryAt > now.getTime()) {
    return skip({ reason: spotify.pauseReason || 'local-backoff', retryAt: new Date(localRetryAt).toISOString() })
  }
  const recoveryPending = (Number.isFinite(retryAt) && retryAt > 0) || (Number.isFinite(localRetryAt) && localRetryAt > 0)
  if (!force && !recoveryPending && status.lastSyncedDate === dateInTimezone(settings.timezone, now)) {
    return skip({ reason: 'already-synced' })
  }
  if (recoveryOnly && !recoveryPending && hourInTimezone(settings.timezone, now) < 7) {
    return skip({ reason: 'before-daily-window' })
  }
  // A failed forced update may follow a successful sync on the same day.
  // Its pending cooldown still needs one recovery, cleared only on success.
  try {
    decision({ result: 'sync-starting', force, recoveryOnly, recoveryPending, retryUnmatched })
    return await sync.run({ scheduled: !force && !recoveryPending, requireExistingPlaylist: true, rejectEmptyMatches: true, ...(retryUnmatched ? { retryUnmatched: true, retrySourceIds } : {}) })
  } catch (error) {
    if (error.pauseReason && Number.isFinite(error.retryAt)) {
      return { paused: true, reason: error.pauseReason, retryAt: new Date(error.retryAt).toISOString(),
        completedSongs: status.checkpoint?.completed || 0 }
    }
    // Spotify safety already persisted its pause. Also back off other transient
    // failures (e.g. NetEase), without logging potentially private error bodies.
    if (!error.pauseReason && sync.store.update) {
      await sync.store.update(state => {
        const failures = (state.spotify.transientFailures || 0) + 1
        state.spotify.transientFailures = failures
        state.spotify.pauseReason = 'transient-backoff'
        state.spotify.retryNotBefore = Math.max(state.spotify.retryNotBefore || 0,
          Date.now() + Math.min(4 * 60 * 60_000, 15 * 60_000 * 2 ** Math.min(failures - 1, 4)))
      })
    }
    throw error
  }
}

export function cloudRunSummary(run) {
  if (run.paused) return `Sync paused (${run.reason}) until ${run.retryAt}; ${run.completedSongs} songs processed, saved progress retained. This is not a completed sync. Scheduled recovery checks every 15 minutes will resume eligible work.`
  if (!run.skipped) return `Synced ${run.matchedCount} of ${run.sourceCount} tracks for ${run.date}.${run.alternateVersionCount ? ` Includes ${run.alternateVersionCount} alternate versions by the same artists.` : ''}`
  if (run.reason === 'provider-cooldown') return `Waiting for provider cooldown until ${run.retryAt}; no music-provider requests made. Scheduled recovery checks every 15 minutes will retry after expiry.`
  if (run.reason === 'before-daily-window') return 'Before 07:00 local time; no pending cooldown recovery. Daily catch-up will be checked after 07:00; no music-provider requests made.'
  if (run.retryAt) return `Local safety pause (${run.reason}) until ${run.retryAt}; no music-provider requests made. Saved progress will resume on a later run.`
  return 'Already synced today; no playlist changes.'
}
