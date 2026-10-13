import test from 'node:test'
import assert from 'node:assert/strict'
import { GitHubState, CloudStore, encryptState, decryptState } from '../src/cloud-state.js'
import { runCloudSync } from '../src/cloud-policy.js'
import { SyncService } from '../src/sync.js'
import { createCloudAudit } from '../src/cloud-audit.js'

const key = 'a1'.repeat(32)
const config = { spotifyClientId: 'client', spotifyRefreshToken: 'private-token', neteaseCookie: 'MUSIC_U=private-cookie', playlistId: 'a'.repeat(22), timezone: 'Asia/Shanghai' }
function fixture() {
  const f = { text: 'baseline', sha: 's0', puts: [], reads: 0, waits: [], events: [], reject: null }
  f.remote = new GitHubState({ repository: 'owner/repo', token: 'private-gh-token', commit: 'a'.repeat(40),
    sleep: async ms => { f.waits.push(ms) }, onDiagnostic: event => f.events.push(event),
    fetchImpl: async (url, options) => {
      if (url.includes('/git/ref/')) return Response.json({})
      if (options.method !== 'PUT') {
        f.reads++
        if (f.readError) return new Response('PRIVATE_ERROR', { status: f.readError })
        if (f.text === null) return new Response('', { status: 404 })
        return Response.json({ sha: f.sha, content: Buffer.from(f.text).toString('base64'), encoding: 'base64' })
      }
      const body = JSON.parse(options.body)
      f.puts.push(body)
      const apply = () => { f.text = Buffer.from(body.content, 'base64').toString(); f.sha = `s${f.puts.length}` }
      if (f.reject) return f.reject(body, apply)
      assert.equal(body.sha, f.sha)
      apply()
      return Response.json({ content: { sha: f.sha } })
    } })
  return f
}

test('409 with unchanged state retries boundedly using fresh SHA and identical ciphertext', async () => {
  const f = fixture(); await f.remote.load()
  const text = encryptState({ spotify: { refreshToken: 'rotated' } }, key)
  f.reject = (_body, apply) => {
    if (f.puts.length === 1) { f.sha = 'same-content-new-sha'; return new Response('PRIVATE_ERROR', { status: 409 }) }
    assert.equal(f.puts.at(-1).sha, 'same-content-new-sha')
    apply(); return Response.json({ content: { sha: f.sha } })
  }
  await f.remote.save(text)
  assert.equal(f.text, text)
  assert.deepEqual(f.waits, [1000])
  assert.equal(f.puts[0].content, f.puts[1].content)
  assert.deepEqual(f.events.map(x => x.result), ['checking', 'retrying'])
})

test('ambiguous successful writes are recognized without a second PUT', async () => {
  for (const failure of ['network', 'invalid-json', 409, 502]) {
    const f = fixture(); await f.remote.load()
    f.reject = (_body, apply) => {
      apply()
      if (failure === 'network') throw Error('PRIVATE_TOKEN')
      if (failure === 'invalid-json') return new Response('broken JSON')
      return new Response('PRIVATE_ERROR', { status: failure })
    }
    await f.remote.save('new encrypted state')
    assert.equal(f.puts.length, 1)
    assert.equal(f.remote.sha, f.sha)
    assert.equal(f.events.at(-1).result, 'already-persisted')
    assert.deepEqual(f.waits, [])
  }
})

test('different remote tokens/checkpoints or deletion fail closed without overwriting', async () => {
  for (const text of ['another writers rotated token and checkpoint', null]) {
    const f = fixture(); await f.remote.load()
    f.reject = () => { f.text = text; return new Response('private details', { status: 409 }) }
    await assert.rejects(f.remote.save('stale local state'), e => e.source === 'github-state' && e.code === 'state-changed')
    assert.equal(f.text, text)
    await assert.rejects(f.remote.save('another stale write'))
    assert.equal(f.puts.length, 1)
    assert.deepEqual(f.waits, [])
  }
})

test('persistent conflicts, server failures and timeouts are bounded; permission failures never retry', async () => {
  for (const status of [409, 503, 'network', 401, 403, 422, 429]) {
    const f = fixture(); await f.remote.load()
    f.reject = () => { if (status === 'network') throw Error('private'); return new Response('private', { status }) }
    await assert.rejects(f.remote.save('next'), e => e.source === 'github-state' && !e.message.includes('private'))
    const retryable = [409, 503, 'network'].includes(status)
    assert.equal(f.puts.length, retryable ? 3 : 1)
    assert.deepEqual(f.waits, retryable ? [1000, 3000] : [])
  }
  const f = fixture(); await f.remote.load()
  f.reject = () => new Response('', { status: 409 }); f.readError = 503
  await assert.rejects(f.remote.save('next'), e => e.operation === 'read')
  assert.equal(f.puts.length, 1)
})

test('concurrent store mutations persist in order and preserve token, cooldown and checkpoint', async () => {
  const f = fixture(); f.text = null; f.sha = undefined
  const store = new CloudStore(config, key, f.remote); await store.load()
  let release; const held = new Promise(resolve => { release = resolve })
  const first = store.update(async state => { await held; state.spotify.refreshToken = 'rotated-token' })
  const second = store.update(state => { state.spotify.retryAfterUntil = 1800000000000 })
  const third = store.update(state => { state.sync.checkpoint = { completed: 30 } })
  release(); await Promise.all([first, second, third])
  const snapshots = f.puts.map(p => decryptState(Buffer.from(p.content, 'base64').toString(), key))
  assert.equal(snapshots[1].spotify.refreshToken, 'rotated-token')
  assert.equal(snapshots[1].spotify.retryAfterUntil, undefined)
  assert.equal(snapshots[2].spotify.retryAfterUntil, 1800000000000)
  assert.equal(snapshots[3].sync.checkpoint.completed, 30)
  assert.equal(snapshots[3].spotify.refreshToken, 'rotated-token')
})

test('storage failure propagates unchanged through sync and policy, without provider backoff or extra writes', async () => {
  const error = Object.assign(Error('safe conflict'), { source: 'github-state', operation: 'write', status: 409, code: 'state-changed' })
  const f = fixture(); f.text = null; f.sha = undefined
  const store = new CloudStore(config, key, f.remote); await store.load()
  const source = { id: 1, name: 'Song', ar: [{ name: 'Singer' }], dt: 200000 }
  let queries = 0, writes = 0
  const sync = new SyncService(store, {
    async searchTracks() { queries++; throw error },
    async replacePlaylist() { writes++ },
  }, async () => [source])
  await assert.rejects(runCloudSync(sync, { force: true }), e => e === error)
  assert.equal(queries, 1); assert.equal(writes, 0)
  assert.equal(store.state.spotify.retryNotBefore, undefined)
  assert.equal(store.state.spotify.transientFailures, undefined)
  assert.equal(store.state.sync.lastRun, undefined)
  assert.equal(f.puts.length, 2) // load + initial checkpoint, no error-handler writes
})

test('storage audit exposes only bounded origin/operation/code, never payloads or raw errors', () => {
  const lines = []
  const audit = createCloudAudit(line => lines.push(line))
  audit('state-storage', { source: 'github-state', operation: 'write', code: 'state-changed', attempt: 2, status: 409,
    error: 'PRIVATE_ERROR', content: 'PRIVATE_CIPHERTEXT', token: 'PRIVATE_TOKEN' })
  audit('app-end', { source: 'PRIVATE_TOKEN', operation: 'PRIVATE_OPERATION', code: 'PRIVATE_ERROR', attempt: 99 })
  assert.doesNotMatch(lines.join(''), /PRIVATE/)
  assert.match(lines[0], /"source":"github-state"/)
  assert.match(lines[0], /"code":"state-changed"/)
})

test('a failed request reservation blocks Spotify, preserves checkpoints, and poisons queued writes', async () => {
  const { RequestSafety } = await import('../src/request-safety.js')
  const f = fixture(); f.text = null; f.sha = undefined
  const store = new CloudStore(config, key, f.remote); await store.load()
  await store.update(state => { state.sync.checkpoint = { completed: 30 }; state.sync.searchCache = { completedQuery: [] } })
  const before = f.text
  f.reject = () => new Response('PRIVATE', { status: 409 })
  let calls = 0, mutated = false
  const safety = new RequestSafety(store)
  await assert.rejects(safety.fetch(async () => { calls++; return Response.json({}) }, 'https://api.spotify.com/v1/search?q=test'), e => e.source === 'github-state')
  await assert.rejects(store.update(() => { mutated = true }))
  assert.equal(calls, 0); assert.equal(mutated, false)
  assert.equal(f.text, before)
  const saved = decryptState(f.text, key)
  assert.equal(saved.sync.checkpoint.completed, 30)
  assert.deepEqual(saved.sync.searchCache, { completedQuery: [] })
})
