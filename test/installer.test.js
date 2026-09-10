import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../src/store.js'
import { GitHubInstaller, isolatedGhEnv, installerMessage } from '../src/installer-github.js'
import { authorizedRequest, createInstallerServer } from '../src/installer-server.js'
import { decryptState } from '../src/cloud-state.js'
import { request } from 'node:http'

function localRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, options, res => {
      let body = ''; res.on('data', chunk => { body += chunk }); res.on('end', () => resolve({ status: res.statusCode, text: async () => body }))
    })
    req.on('error', reject); req.end(options.body)
  })
}

const root = path.resolve('.')
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'daily-relay-installer-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store({ directory }); await store.load()
  return store
}

test('installer data is isolated from cwd and persists its own installation only', async t => {
  const store = await fixture(t)
  await store.update(state => { state.installer = { owner: 'friend', stateKey: 'private-test-key' } })
  const next = new Store({ directory: store.directory }); await next.load()
  assert.equal(next.state.installer.owner, 'friend')
  assert.equal(JSON.parse(await readFile(path.join(store.directory, 'state.json'), 'utf8')).installer.stateKey, 'private-test-key')
})

test('HTTP guard rejects foreign origins, missing sessions, form posts and DNS rebinding', () => {
  const origin = 'http://127.0.0.1:18787'; const session = 'abc'
  const good = { method: 'POST', headers: { host: '127.0.0.1:18787', cookie: 'relay_session=abc', origin, 'content-type': 'application/json' } }
  assert.equal(authorizedRequest(good, origin, session), true)
  for (const patch of [{ origin: 'https://evil.example' }, { cookie: '' }, { host: 'evil.example:18787' }, { 'content-type': 'text/plain' }]) {
    assert.equal(authorizedRequest({ ...good, headers: { ...good.headers, ...patch } }, origin, session), false)
  }
})

test('CLI environment never borrows caller tokens and errors never echo upstream secrets', () => {
  const env = isolatedGhEnv('/tmp/isolated-example')
  assert.equal(env.GH_TOKEN, undefined); assert.equal(env.GITHUB_TOKEN, undefined)
  assert.equal(env.GH_CONFIG_DIR, '/tmp/isolated-example')
  assert.ok(!installerMessage(new Error('登录失败 MUSIC_U=private secret')).includes('private'))
})

test('fresh installer refuses GitHub API access without its own explicit login record', async t => {
  const store = await fixture(t)
  const gh = new GitHubInstaller(store, root, { binary: '/usr/bin/false' })
  await assert.rejects(gh.profile(), /不会借用/)
  assert.equal(gh.login.status, 'idle')
})

test('guided server exposes only safe status and requires consent for deployment', async t => {
  const store = await fixture(t)
  await store.update(state => { state.spotify.refreshToken = 'private-token'; state.settings.neteaseCookie = 'MUSIC_U=private-cookie' })
  const origin = 'http://127.0.0.1:18787'
  const app = await createInstallerServer({ store, origin, session: 'session-test' })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  t.after(() => app.server.close())
  const address = `http://127.0.0.1:${app.server.address().port}`
  const headers = { host: '127.0.0.1:18787', cookie: 'relay_session=session-test', origin, 'content-type': 'application/json' }
  const response = await localRequest(`${address}/api/status`, { headers })
  assert.equal(response.status, 200)
  const result = await response.text()
  assert.ok(!result.includes('private-token')); assert.ok(!result.includes('private-cookie'))
  assert.equal((await localRequest(`${address}/api/status`, { headers: { host: '127.0.0.1:18787' } })).status, 403)
  assert.equal((await localRequest(`${address}/api/deploy`, { method: 'POST', headers, body: JSON.stringify({ consent: false }) })).status, 400)
  const html = await localRequest(address, { headers }).then(r => r.text())
  const shared = await readFile(path.join(root, 'public/index.html'), 'utf8')
  assert.equal(html.replace('<meta name="daily-relay-mode" content="installer"><link rel="stylesheet" href="/setup.css">', ''), shared)
  for (const route of ['/app.js', '/styles.css', '/setup.js', '/setup.css', '/setup-panels.html', '/assets/daily-relay-cover-citypop-no-text.jpg']) {
    assert.equal((await localRequest(`${address}${route}`, { headers })).status, 200, route)
  }
  const guide = await localRequest(`${address}/setup-panels.html`, { headers }).then(r => r.text())
  for (const copy of ['GitHub', 'Client ID', '私有']) assert.ok(guide.includes(copy), copy)
  assert.equal((await localRequest(`${address}/../.data/state.json`, { headers })).status, 404)
})

test('cloud payload allowlist contains no installer, personal state, source credentials or maintainer account IDs', async t => {
  const store = await fixture(t)
  const github = new GitHubInstaller(store, root)
  const entries = await github.sourceEntries()
  assert.ok(entries.some(e => e.path === '.github/workflows/daily-sync.yml'))
  assert.ok(entries.some(e => e.path === 'src/request-safety.js'))
  assert.ok(!entries.some(e => /installer|state.enc|\.data|\.git\/|public\/|docs\//.test(e.path)))
  assert.ok(!JSON.stringify(entries).includes('4BI0KArIAsnQGHZRY8DSIE'))
})

test('automatic deployment uses the friend account, encrypts state, and enables Actions only after secrets and state', async t => {
  const store = await fixture(t)
  await store.update(state => {
    state.settings.spotifyClientId = 'a'.repeat(32); state.settings.neteaseCookie = 'MUSIC_U=friend'; state.spotify.refreshToken = 'friend-refresh'
    state.sync.lastSyncedDate = '2026-09-10'
    state.sync.lastSuccessfulRun = { date: '2026-09-10', matchedCount: 12, sourceCount: 12 }
    state.sync.checkpoint = { completed: 3, signature: 'handoff-test', matches: [], unmatched: [] }
    state.sync.searchCache = { 'private-query': [] }
    state.spotify.requestTimes = [123, 456]
  })
  const operations = []; const secrets = {}; let stateContent; let created
  const gh = new GitHubInstaller(store, root, { run: async (args, input) => {
    operations.push({ args, input })
    if (args[0] === 'secret') { secrets[args[2]] = input; assert.ok(!args.includes(input)); return '' }
    const endpoint = args[5]; const method = args[4]; const body = input ? JSON.parse(input) : null
    if (endpoint === 'user') return JSON.stringify({ login: 'friend' })
    if (endpoint === 'user/repos') { created = body; return JSON.stringify({ owner: { login: 'friend' } }) }
    if (endpoint.includes('/actions/workflows/') && endpoint.includes('/runs?')) return JSON.stringify({ workflow_runs: [] })
    if (endpoint.includes('/contents/state.enc')) return JSON.stringify({ content: Buffer.from(stateContent).toString('base64') })
    if (endpoint.endsWith('/git/trees')) { if (body.tree[0]?.path === 'state.enc') stateContent = body.tree[0].content; return JSON.stringify({ sha: 'b'.repeat(40) }) }
    if (endpoint.endsWith('/git/commits')) return JSON.stringify({ sha: 'c'.repeat(40) })
    if (method === 'GET') throw Object.assign(new Error('missing'), { status: 404 })
    return '{}'
  } })
  await gh.deployment({ consent: true, visibility: 'private' }, { async createPlaylist() { return { id: 'p'.repeat(22), external_urls: { spotify: 'https://open.spotify.com/playlist/p' } } } })
  assert.equal(created.private, true)
  assert.match(store.state.installer.repository, /^friend\/daily-relay-/)
  const config = JSON.parse(secrets.DAILY_RELAY_CONFIG)
  assert.equal(config.spotifyRefreshToken, 'friend-refresh')
  assert.ok(!stateContent.includes('friend-refresh'))
  assert.equal(decryptState(stateContent, secrets.DAILY_RELAY_STATE_KEY).spotify.refreshToken, 'friend-refresh')
  const transferred = decryptState(stateContent, secrets.DAILY_RELAY_STATE_KEY)
  assert.equal(transferred.sync.lastSyncedDate, '2026-09-10')
  assert.equal(transferred.sync.checkpoint.completed, 3)
  assert.deepEqual(transferred.sync.searchCache, { 'private-query': [] })
  assert.deepEqual(transferred.spotify.requestTimes, [123, 456])
  const disable = operations.findIndex(o => o.args.includes('PUT') && o.input.includes('"enabled":false'))
  const secret = operations.findIndex(o => o.args[0] === 'secret')
  const state = operations.findIndex(o => o.input.includes('refs/heads/daily-relay-state'))
  const enable = operations.findIndex(o => o.input.includes('"enabled":true'))
  const dispatch = operations.findIndex(o => o.args.some(a => a.endsWith('/dispatches')))
  assert.ok(disable < secret && secret < state && state < enable && enable < dispatch)
  assert.equal(store.state.settings.scheduleEnabled, false)
})

test('installer never overwrites a pre-existing unrelated repository', async t => {
  const store = await fixture(t)
  await store.update(state => {
    state.settings.spotifyClientId = 'a'.repeat(32); state.settings.neteaseCookie = 'MUSIC_U=x'; state.spotify.refreshToken = 'x'
    state.sync.playlistId = 'a'.repeat(22)
    state.installer = { owner: 'friend', installationId: 'abc', repository: 'friend/daily-relay-abc' }
  })
  const mutations = []
  const gh = new GitHubInstaller(store, root, { run: async args => {
    if (args.includes('POST') || args.includes('PUT')) mutations.push(args)
    return JSON.stringify(args[5] === 'user' ? { login: 'friend' } : { owner: { login: 'friend' }, description: 'Unrelated existing project' })
  } })
  await assert.rejects(gh.deployment({ consent: true }, {}), /未覆盖/)
  assert.equal(mutations.length, 0)
})
