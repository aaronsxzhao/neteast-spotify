import { appendFile } from 'node:fs/promises'
import { CloudStore, GitHubState, parseConfig } from './cloud-state.js'
import { SpotifyClient } from './spotify.js'
import { SyncService, dateInTimezone, hourInTimezone } from './sync.js'
import { getDailyRecommendations } from './netease.js'
import { runCloudSync, cloudRunSummary } from './cloud-policy.js'
import { migrateRequestBudget } from './request-safety.js'
import { createCloudAudit } from './cloud-audit.js'

const audit = createCloudAudit()
let phase = 'config'
function progress(details) {
  phase = details.phase
  audit('app-stage', details)
}

function mask(value) {
  if (typeof value !== 'string' || !value) return
  console.log(`::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`)
}

async function main() {
  audit('app-start', { phase })
  mask(process.env.DAILY_RELAY_CONFIG)
  mask(process.env.DAILY_RELAY_STATE_KEY)
  const config = parseConfig(process.env.DAILY_RELAY_CONFIG)
  mask(config.spotifyRefreshToken)
  mask(config.neteaseCookie)
  for (const cookie of config.neteaseCookie.split(';')) {
    const value = cookie.slice(cookie.indexOf('=') + 1).trim()
    // Non-secret flags like 0 and / would corrupt every date and URL in logs.
    if (value.length >= 8) mask(value)
  }
  const remote = new GitHubState({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, commit: process.env.GITHUB_SHA })
  const store = new CloudStore(config, process.env.DAILY_RELAY_STATE_KEY, remote)
  progress({ phase: 'state-load' })
  await store.load()
  progress({ phase: 'state-migration' })
  await migrateRequestBudget(store)
  mask(store.state.spotify.refreshToken)
  const spotify = new SpotifyClient(store, async (url, options) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) })
    if (url === 'https://accounts.spotify.com/api/token') {
      const result = await response.clone().json().catch(() => ({}))
      mask(result.access_token)
      mask(result.refresh_token)
    }
    return response
  })
  const sync = new SyncService(store, spotify, async (cookie) => {
    // The upstream library logs raw error objects/cookies. This standalone job
    // emits only our sanitized failure, never the provider's debug payload.
    const methods = ['log', 'info', 'warn', 'error', 'debug']
    const originals = methods.map((name) => console[name])
    for (const name of methods) console[name] = () => {}
    try { return await getDailyRecommendations(cookie) }
    finally { methods.forEach((name, index) => { console[name] = originals[index] }) }
  }, progress)
  const force = process.env.FORCE_SYNC === 'true'
  progress({ phase: 'policy', date: dateInTimezone(store.state.settings.timezone),
    localHour: hourInTimezone(store.state.settings.timezone), timezone: store.state.settings.timezone,
    lastSyncedDate: store.state.sync.lastSyncedDate })
  let run
  try { run = await runCloudSync(sync, {
    force, recoveryOnly: process.env.RECOVERY_ONLY === 'true',
    retryUnmatched: process.env.RETRY_UNMATCHED === 'true',
    retrySourceIds: (process.env.RETRY_SOURCE_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
    onDecision: details => audit('policy-decision', details),
  }) } finally {
    const { requests, cacheHits, retries, lastStatus, lastOperation } = spotify.safety.stats
    console.log(`Spotify request metrics: requests=${requests}, cachedQueries=${cacheHits}, retries=${retries}, lastOperation=${lastOperation ?? 'none'}, lastStatus=${lastStatus ?? 'none'}, completedSongs=${run?.sourceCount ?? store.state.sync.checkpoint?.completed ?? 0}.`)
    audit('request-metrics', { requests, cacheHits, retries, status: lastStatus })
  }
  audit('app-result', { phase, result: run.paused ? 'paused' : run.skipped ? 'skipped' : 'success',
    reason: run.reason, retryAt: run.retryAt, date: run.date, sourceCount: run.sourceCount,
    matchedCount: run.matchedCount, unmatchedCount: run.unmatchedCount, completedSongs: run.completedSongs })
  progress({ phase: 'summary' })
  const summary = cloudRunSummary(run)
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  audit('app-end', { result: run.paused ? 'paused' : run.skipped ? 'skipped' : 'success' })
}

main().catch((error) => {
  audit('app-end', { phase, result: 'failed', status: error.status })
  // Provider errors may embed private request data. Public logs only get a code.
  console.error(`Daily Relay failed (${Number.isFinite(error.status) ? error.status : 'Error'}). Check GitHub Secrets, account authorization, provider availability, and state-branch write permission.`)
  if (Number.isFinite(error.retryAfterSeconds)) console.error(`Provider cooldown: retry after ${error.retryAfterSeconds} seconds.`)
  if (Number.isFinite(error.retryAt)) audit('retry-state', { reason: error.pauseReason, retryAt: new Date(error.retryAt).toISOString() })
  process.exitCode = 1
})
