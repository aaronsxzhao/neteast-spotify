import fs from 'node:fs/promises'
import path from 'node:path'
import { Store } from '../src/store.js'
import { SpotifyClient } from '../src/spotify.js'
import { runCatalogReview } from '../src/catalog-review.js'
const [planFile, progressFile] = process.argv.slice(2)
if (!planFile || !progressFile) throw Error('Usage: node scripts/review-catalog.js PLAN.json PROGRESS.json')
const plan = JSON.parse(await fs.readFile(planFile, 'utf8'))
const store = new Store(); await store.load()
const client = new SpotifyClient(store, undefined, { maxPerRun: 50, minIntervalMs: 8000 })
const progress = await fs.readFile(progressFile, 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return {}; throw e })
await fs.mkdir(path.dirname(path.resolve(progressFile)), { recursive: true, mode: 0o700 })
try {
 await runCatalogReview(client, { ...plan, progress, save: async value => {
   await fs.writeFile(progressFile + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 })
   await fs.rename(progressFile + '.tmp', progressFile)
   console.log(JSON.stringify({ completedRequests: Object.keys(value.results || {}).length, planComplete: value.requestPlanComplete || false, blocked: value.blocked }))
 } })
} catch(e) {
 console.error(JSON.stringify({ reason:e.pauseReason || 'verification-failed', retryAt:e.retryAt, status:e.status, networkCode:e.networkCode }))
 process.exitCode=1
} finally {console.log(JSON.stringify(client.safety.stats))}
