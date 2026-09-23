import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm, cp, writeFile, symlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { cloudEntries, validatePayload } from '../src/installer-payload.js'
import { GitHubInstaller } from '../src/installer-github.js'
import { Store } from '../src/store.js'

test('friend deployment contains complete cloud dependencies and a reproducible manifest', async () => {
  const entries = await cloudEntries(process.cwd())
  assert.ok(entries.some(e => e.path === 'src/cloud-audit.js'))
  assert.ok(entries.some(e => e.path === 'src/match-cache.js'))
  assert.doesNotThrow(() => validatePayload(entries))
  assert.throws(() => validatePayload(entries.filter(e => e.path !== 'src/match-cache.js')), /Incomplete cloud payload/)
  assert.equal(entries.find(e => e.path === 'daily-relay-build.json').content,
    (await cloudEntries(process.cwd())).find(e => e.path === 'daily-relay-build.json').content)
  for (const forbidden of ['release-macos.yml', 'installer-github.js', 'store.js', 'state.enc']) {
    assert.ok(!entries.some(e => e.path.endsWith(forbidden)))
  }
})

test('packaged first-run smoke check passes guarded HTTP requests on an ephemeral port', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'relay-smoke-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of ['src', 'public', 'installer', 'package.json']) await cp(name, path.join(directory, name), { recursive: true })
  await symlink(path.resolve('node_modules'), path.join(directory, 'node_modules'))
  await writeFile(path.join(directory, 'build-info.json'), JSON.stringify({ version: '1.2.0-build.1.1', sourceCommit: 'a'.repeat(40) }))
  const output = execFileSync(process.execPath, ['scripts/verify-bundle.js', directory], { encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, NODE_OPTIONS: '', NODE_PATH: '' } })
  assert.match(output, /Packaged first-run smoke check passed/)
})

async function fixture(t, { paused = false, active = false, foreign = false, refFailure = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'relay-upgrade-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store({ directory }); await store.load()
  await store.update(s => {
    s.installer = { deployed: true, owner: 'friend', repository: 'friend/daily-relay-123456', installationId: '123456abcdef', stateKey: 'keep-key', paused }
    s.spotify.refreshToken = 'keep-token'; s.spotify.retryAfterUntil = Date.now() + 900000
    s.sync.playlistId = 'keep-playlist'; s.sync.checkpoint = { completed: 4 }
  })
  const calls = []
  const gh = new GitHubInstaller(store, process.cwd())
  gh.api = async (endpoint, method = 'GET', data) => {
    calls.push({ endpoint, method, data })
    if (endpoint === 'user') return { login: 'friend' }
    if (endpoint === 'repos/friend/daily-relay-123456') return { owner: { login: foreign ? 'stranger' : 'friend' }, description: 'Daily Relay installation 123456abcdef', default_branch: 'main' }
    if (endpoint.endsWith('daily-sync.yml')) return { state: paused ? 'disabled_manually' : 'active' }
    if (endpoint.includes('/runs?')) return { workflow_runs: active && endpoint.includes('status=in_progress') ? [{ id: 1 }] : [] }
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: 'parent' } }
    if (endpoint.endsWith('/git/commits/parent')) return { tree: { sha: 'old-tree' } }
    if (endpoint.endsWith('/git/trees')) return { sha: 'new-tree' }
    if (endpoint.endsWith('/git/commits')) return { sha: 'new-commit' }
    if (endpoint.endsWith('/git/refs/heads/main') && refFailure) throw new Error('non-fast-forward')
    return {}
  }
  return { gh, store, calls }
}

test('cloud upgrade changes only managed code, preserves state/history, restores prior schedule and never dispatches', async t => {
  const { gh, store, calls } = await fixture(t)
  const before = structuredClone({ spotify: store.state.spotify, sync: store.state.sync, key: store.state.installer.stateKey })
  await gh.upgrade({ consent: true })
  assert.deepEqual({ spotify: store.state.spotify, sync: store.state.sync, key: store.state.installer.stateKey }, before)
  assert.equal(store.state.installer.paused, false)
  const tree = calls.find(c => c.endpoint.endsWith('/git/trees'))
  assert.equal(tree.data.base_tree, 'old-tree')
  assert.deepEqual(calls.find(c => c.endpoint.endsWith('/git/commits')).data.parents, ['parent'])
  assert.equal(calls.find(c => c.endpoint.endsWith('/git/refs/heads/main')).data.force, false)
  assert.ok(!calls.some(c => /secret|state.enc|dispatch|daily-relay-state/.test(c.endpoint)))
  assert.ok(calls.findIndex(c => c.endpoint.endsWith('/disable')) < calls.findIndex(c => c.endpoint.endsWith('/git/trees')))
  assert.ok(calls.findIndex(c => c.endpoint.endsWith('/enable')) > calls.findIndex(c => c.endpoint.endsWith('/git/refs/heads/main')))
})

test('paused installations remain paused after an explicit code upgrade', async t => {
  const { gh, store, calls } = await fixture(t, { paused: true })
  await gh.upgrade({ consent: true })
  assert.equal(store.state.installer.paused, true)
  assert.ok(!calls.some(c => c.endpoint.endsWith('/enable')))
})

test('upgrade refuses missing consent and foreign repositories without mutations', async t => {
  const a = await fixture(t)
  await assert.rejects(a.gh.upgrade(), /确认/)
  assert.equal(a.calls.length, 0)
  const b = await fixture(t, { foreign: true })
  await assert.rejects(b.gh.upgrade({ consent: true }), /归属/)
  assert.ok(b.calls.every(c => c.method === 'GET'))
})

test('active runs and concurrent code changes stop upgrades and leave the schedule safely paused', async t => {
  const a = await fixture(t, { active: true })
  await assert.rejects(a.gh.upgrade({ consent: true }), /仍有云端任务/)
  assert.equal(a.store.state.installer.paused, true)
  assert.ok(!a.calls.some(c => /git\/trees|\/enable$/.test(c.endpoint)))
  const b = await fixture(t, { refFailure: true })
  await assert.rejects(b.gh.upgrade({ consent: true }), /non-fast-forward/)
  assert.equal(b.store.state.installer.paused, true)
  assert.ok(!b.calls.some(c => c.endpoint.endsWith('/enable')))
})

test('release workflow tests, verifies, builds and only then publishes without music credentials', async () => {
  const workflow = await readFile('.github/workflows/release-macos.yml', 'utf8')
  assert.match(workflow, /branches: \[main\]/)
  assert.match(workflow, /runs-on: macos-14/)
  assert.match(workflow, /github.repository == 'aaronsxzhao\/neteast-spotify'/)
  const steps = ['node --test test/*.test.js', 'node scripts/verify-cloud-payload.js', 'node scripts/build-macos.js', 'node scripts/publish-release.js']
  assert.ok(steps.every((step, i) => workflow.includes(step) && (!i || workflow.indexOf(step) > workflow.indexOf(steps[i - 1]))))
  assert.ok(!/DAILY_RELAY_CONFIG|DAILY_RELAY_STATE_KEY|MUSIC_U/.test(workflow))
  const build = await readFile('scripts/build-macos.js', 'utf8')
  for (const check of ['verify-cloud-payload.js', 'verify-bundle.js', 'build-info.json', 'sha256', 'git']) assert.ok(build.includes(check))
})
