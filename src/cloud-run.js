import { appendFile } from 'node:fs/promises'
import { CloudStore, GitHubState, parseConfig } from './cloud-state.js'
import { SpotifyClient } from './spotify.js'
import { SyncService } from './sync.js'
import { getDailyRecommendations } from './netease.js'

function mask(value) {
  if (typeof value !== 'string' || !value) return
  console.log(`::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`)
}

async function main() {
  const config = parseConfig(process.env.DAILY_RELAY_CONFIG)
  mask(process.env.DAILY_RELAY_CONFIG)
  mask(config.spotifyRefreshToken)
  mask(config.neteaseCookie)
  for (const cookie of config.neteaseCookie.split(';')) {
    const value = cookie.slice(cookie.indexOf('=') + 1).trim()
    // Non-secret flags like 0 and / would corrupt every date and URL in logs.
    if (value.length >= 8) mask(value)
  }
  mask(process.env.DAILY_RELAY_STATE_KEY)
  const remote = new GitHubState({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, commit: process.env.GITHUB_SHA })
  const store = new CloudStore(config, process.env.DAILY_RELAY_STATE_KEY, remote)
  await store.load()
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
  })
  const force = process.env.FORCE_SYNC === 'true'
  const run = await sync.run({ scheduled: !force, requireExistingPlaylist: true, rejectEmptyMatches: true })
  const summary = run.skipped ? 'Already synced today; no playlist changes.' : `Synced ${run.matchedCount} of ${run.sourceCount} tracks for ${run.date}.`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}

main().catch((error) => {
  // Provider errors may embed private request data. Public logs only get a code.
  console.error(`Daily Relay failed (${error.status || error.name || 'Error'}). Check GitHub Secrets, account authorization, provider availability, and state-branch write permission.`)
  if (Number.isFinite(error.retryAfterSeconds)) console.error(`Provider cooldown: retry after ${error.retryAfterSeconds} seconds.`)
  process.exitCode = 1
})
