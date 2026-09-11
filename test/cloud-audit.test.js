import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudAudit } from '../src/cloud-audit.js'
import { runCloudSync } from '../src/cloud-policy.js'
import { SyncService } from '../src/sync.js'

function recorder() {
  const lines = []
  const audit = createCloudAudit(line => lines.push(line), () => new Date('2026-09-11T00:00:00Z'))
  return { audit, lines, records: () => lines.map(line => JSON.parse(line.slice('DAILY_RELAY_AUDIT '.length))) }
}

test('audit excludes raw state/errors/credentials and tolerates broken output', () => {
  const r = recorder()
  r.audit('app-end', { phase: 'matching', result: 'failed', status: 503, requests: NaN,
    error: { message: 'PRIVATE_ERROR' }, cookie: 'PRIVATE_COOKIE', token: 'PRIVATE_TOKEN',
    reason: 'PRIVATE_ERROR', state: { secret: 'PRIVATE_STATE' } })
  assert.deepEqual(r.records()[0], { event: 'app-end', at: '2026-09-11T00:00:00.000Z',
    phase: 'matching', result: 'failed', status: 503, reason: 'other-pause' })
  assert.doesNotMatch(r.lines.join(''), /PRIVATE/)
  assert.doesNotThrow(() => createCloudAudit(() => { throw Error('broken stdout') })('app-start'))
})

test('every policy skip has an explicit reason and makes no sync/provider calls', async () => {
  const now = new Date('2026-09-10T22:00:00Z') // Beijing 06:00
  for (const reason of ['already-synced', 'before-daily-window', 'provider-cooldown', 'run-budget']) {
    const r = recorder()
    const state = { settings: { timezone: 'Asia/Shanghai' }, spotify: {}, sync: {} }
    if (reason === 'already-synced') state.sync.lastSyncedDate = '2026-09-11'
    if (reason === 'provider-cooldown') state.spotify.retryAfterUntil = now.getTime() + 60000
    if (reason === 'run-budget') Object.assign(state.spotify, { retryNotBefore: now.getTime() + 60000, pauseReason: reason })
    let calls = 0
    const run = await runCloudSync({ store: { state }, run() { calls++ } },
      { recoveryOnly: true, onDecision: d => r.audit('policy-decision', d) }, now)
    assert.equal(run.reason, reason)
    assert.equal(r.records()[0].reason, reason)
    assert.equal(r.records()[0].result, 'skipped')
    assert.equal(calls, 0)
  }
})

test('policy observer does not change recovery or failure/pause handling', async () => {
  const state = { settings: { timezone: 'Asia/Shanghai' }, spotify: {}, sync: {} }
  const sync = { store: { state }, async run() { return { ok: true } } }
  const r = recorder()
  assert.deepEqual(await runCloudSync(sync, { onDecision() { throw Error('observer') } }), { ok: true })
  await runCloudSync(sync, { onDecision: d => r.audit('policy-decision', d) })
  assert.equal(r.records()[0].result, 'sync-starting')
  sync.run = async () => { throw Object.assign(Error('private'), { pauseReason: 'run-budget', retryAt: Date.now() + 60000 }) }
  assert.equal((await runCloudSync(sync)).paused, true)
  sync.run = async () => { throw Error('private') }
  await assert.rejects(runCloudSync(sync), /private/)
})

test('sync stage observer identifies write failure and successful checkpoint resume without new searches', async () => {
  const state = { settings: { timezone: 'Asia/Shanghai', neteaseCookie: 'PRIVATE_COOKIE' }, spotify: { refreshToken: 'PRIVATE_TOKEN' }, sync: { playlistId: 'test' } }
  const store = { state, async update(fn) { fn(state) } }
  const source = { id: 1, name: 'Private song', ar: [{ name: 'Private singer' }], dt: 200000 }
  let searches = 0, fail = true
  const spotify = {
    async searchTracks() { searches++; return [{ id: '1', uri: 'spotify:track:1', name: source.name, artists: source.ar, duration_ms: source.dt }] },
    async replacePlaylist() { if (fail) throw Error('PRIVATE_ERROR') }, async updatePlaylist() {},
  }
  const r = recorder()
  const sync = new SyncService(store, spotify, async () => [source], d => r.audit('app-stage', d))
  await assert.rejects(sync.run(), /PRIVATE_ERROR/)
  assert.equal(r.records().at(-1).phase, 'playlist-write')
  assert.ok(r.records().some(d => d.phase === 'checkpoint-save' && d.completedSongs === 1))
  const previous = searches
  fail = false
  assert.equal((await sync.run()).matchedCount, 1)
  assert.equal(searches, previous)
  assert.equal(r.records().at(-1).phase, 'save-success')
  assert.doesNotMatch(r.lines.join(''), /PRIVATE|Private/)
})

test('invalid configuration logs app start and failed config phase before any networking', () => {
  const result = spawnSync(process.execPath, ['src/cloud-run.js'], { encoding: 'utf8',
    env: { PATH: process.env.PATH, DAILY_RELAY_CONFIG: '{}' } })
  assert.equal(result.status, 1)
  const lines = result.stdout.split('\n').filter(l => l.startsWith('DAILY_RELAY_AUDIT '))
  const events = lines.map(l => JSON.parse(l.slice('DAILY_RELAY_AUDIT '.length)))
  assert.equal(events[0].event, 'app-start')
  assert.equal(events.at(-1).result, 'failed')
  assert.equal(events.at(-1).phase, 'config')
})

test('workflow entry and always-run exit scripts work without a checkout and show skipped sync', () => {
  const yaml = readFileSync(new URL('../.github/workflows/daily-sync.yml', import.meta.url), 'utf8')
  assert.ok(yaml.indexOf('Record workflow start') < yaml.indexOf('uses: actions/checkout'))
  assert.match(yaml, /Record workflow outcome\n\s+if: \$\{\{ always\(\) \}\}/)
  assert.match(yaml, /TRIGGER_SCHEDULE: \$\{\{ github.event.schedule \|\| '' \}\}/)
  const scripts = [...yaml.matchAll(/node <<'NODE'\n([\s\S]*?)\n          NODE/g)].map(m => m[1].replace(/^          /gm, ''))
  assert.equal(scripts.length, 2)
  const dir = mkdtempSync(join(tmpdir(), 'relay-audit-test-'))
  try {
    for (const cron of ['0 0,1,2,23 * * *', '5,20,35,50 * * * *', '']) {
      const env = { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        TRIGGER_SCHEDULE: cron, GITHUB_EVENT_NAME: cron ? 'schedule' : 'workflow_dispatch',
        GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'test',
        JOB_STATUS: 'failure', START_OUTCOME: 'success', CHECKOUT_OUTCOME: 'failure', SYNC_OUTCOME: 'skipped',
        PRIVATE_TOKEN: 'DO_NOT_LOG_THIS' }
      const output = scripts.map(script => execFileSync(process.execPath, ['-e', script], { env, cwd: dir, encoding: 'utf8' }))
      const records = output.map(line => JSON.parse(line.trim().slice('DAILY_RELAY_AUDIT '.length)))
      assert.equal(records[0].cron, cron || null)
      assert.equal(records[1].steps.checkout, 'failure')
      assert.equal(records[1].steps.sync, 'skipped')
      assert.doesNotMatch(output.join(''), /DO_NOT_LOG_THIS/)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
