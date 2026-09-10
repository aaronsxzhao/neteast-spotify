import { createServer } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.js'
import { SpotifyClient } from './spotify.js'
import { createQrLogin, checkQrLogin } from './netease.js'
import { GitHubInstaller, InstallerError, installerMessage } from './installer-github.js'
import { SPOTIFY_REDIRECT_URI, APP_ORIGIN } from './config.js'
import { localSyncAllowed, runManualSync } from './installer-manual.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
export function authorizedRequest(request, origin, session) {
  if (request.headers.host !== new URL(origin).host) return false
  const token = request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('relay_session='))?.slice(14)
  if (!equal(token, session)) return false
  if (request.method !== 'GET' && (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json')) return false
  return true
}

export async function createInstallerServer({ directory, origin = APP_ORIGIN, session = randomBytes(32).toString('hex'), githubOptions,
  netease = { createQrLogin, checkQrLogin }, spotifyFetch, spotifyClient, getRecommendations, onExit = () => {}, store: providedStore } = {}) {
  const store = providedStore || new Store({ directory })
  await store.load()
  // This process is only a setup/control panel. It NEVER runs a local scheduler.
  const spotify = spotifyClient || new SpotifyClient(store, spotifyFetch)
  const github = new GitHubInstaller(store, ROOT, githubOptions)
  // Reuse only this installer's own CLI login after a normal app restart.
  github.profile().catch(() => {})
  const qrFlows = new Map()
  let job = null
  let cloud = null
  let cloudReadAt = 0
  let manualProgress = { status: 'idle', message: '' }
  const manualStatus = () => {
    const { sync, spotify } = store.state
    const run = sync.lastSuccessfulRun
    return { ...manualProgress, available: localSyncAllowed(store.state), playlistUrl: sync.playlistUrl,
      lastSyncedDate: sync.lastSyncedDate, matchedCount: run?.matchedCount, sourceCount: run?.sourceCount,
      unmatchedCount: run?.unmatchedCount, alternateVersionCount: run?.alternateVersionCount,
      completedSongs: sync.checkpoint?.completed || 0, pending: Boolean(sync.checkpoint),
      retryAfterUntil: spotify.retryAfterUntil, retryNotBefore: spotify.retryNotBefore }
  }
  const respond = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)) }
  const status = () => ({ netease: Boolean(store.state.settings.neteaseCookie), spotify: Boolean(store.state.spotify.refreshToken),
    spotifyName: store.state.spotify.profile?.displayName, clientId: store.state.settings.spotifyClientId,
    redirectUri: SPOTIFY_REDIRECT_URI, github: github.login, deployment: github.progress, cloud, manual: manualStatus(),
    deployed: Boolean(store.state.installer?.deployed), repository: store.state.installer?.repository, visibility: store.state.installer?.visibility,
    busy: Boolean(job), playlistName: store.state.settings.playlistName, maintenance: Boolean(store.state.installer?.maintenance), paused: Boolean(store.state.installer?.paused) })
  const readBody = async req => {
    let bytes = 0; const chunks = []
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 16000) throw new InstallerError('输入过长。'); chunks.push(chunk) }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  }
  const editable = () => { if (job || (store.state.installer?.deployed && !store.state.installer?.maintenance)) throw new InstallerError('云端已接管账号，请先点击“重新连接账号”，避免本机与云端令牌冲突。') }
  const startJob = (work, onError = error => { github.progress = { status: 'error', message: installerMessage(error) } }) => {
    if (job) throw new InstallerError('已有操作正在执行，请稍候。')
    job = Promise.resolve().then(work).catch(onError).finally(() => { job = null })
  }
  const server = createServer(async (req, res) => {
    res.setHeader('referrer-policy', 'no-referrer')
    try {
      const url = new URL(req.url, origin)
      if (req.headers.host !== new URL(origin).host) return respond(res, 403, { error: 'Host rejected' })
      if (req.method === 'GET' && url.pathname === '/health') return respond(res, 200, { app: 'daily-relay-installer', authenticated: authorizedRequest(req, origin, session) })
      if (req.method === 'GET' && url.pathname === '/launch' && equal(url.searchParams.get('key'), session)) {
        res.writeHead(302, { location: '/', 'cache-control': 'no-store', 'set-cookie': `relay_session=${session}; HttpOnly; SameSite=Lax; Path=/` }); return res.end()
      }
      if (!authorizedRequest(req, origin, session)) return respond(res, 403, { error: '请双击 Daily Relay 重新打开安全安装页面。' })
      if (req.method === 'GET' && url.pathname === '/api/status') return respond(res, 200, status())
      if (req.method === 'POST' && url.pathname === '/api/sync') {
        const input = await readBody(req)
        if (!input.consent) throw new InstallerError('请确认手动同步会创建或更新你的专用 Spotify 歌单。')
        if (job) return respond(res, 200, { running: true })
        if (store.state.installer?.deployed) {
          job = Promise.resolve().then(() => github.dispatch())
          try {
            const result = await job
            cloudReadAt = 0
            return respond(res, 200, { ...result, mode: 'cloud' })
          } finally { job = null }
        }
        if (!localSyncAllowed(store.state)) throw new InstallerError('请先完成已经开始的云端配置，避免本机与云端同时修改歌单。')
        if (!store.state.settings.neteaseCookie || !store.state.spotify.refreshToken || !store.state.settings.spotifyClientId) throw new InstallerError('请先连接网易云和 Spotify。')
        const until = Math.max(store.state.spotify.retryAfterUntil || 0, store.state.spotify.retryNotBefore || 0)
        if (until > Date.now()) return respond(res, 200, { paused: true, until, mode: 'local' })
        manualProgress = { status: 'running', message: '正在本机同步，请保持 App 运行；此操作不需要 GitHub。' }
        startJob(async () => {
          const run = await runManualSync(store, spotify, getRecommendations)
          manualProgress = { status: 'done', message: `同步成功：${run.matchedCount}/${run.sourceCount} 首，${run.unmatchedCount} 首未匹配。` }
        }, error => { manualProgress = { status: 'error', message: installerMessage(error) } })
        return respond(res, 202, { started: true, mode: 'local' })
      }
      if (req.method === 'POST' && url.pathname === '/api/github/connect') { if (job) throw new InstallerError('操作进行中，暂时不能切换 GitHub 账号。'); const input = await readBody(req); if (!input.consent) throw new InstallerError('请确认 GitHub 授权范围。'); return respond(res, 200, await github.startLogin()) }
      if (req.method === 'POST' && url.pathname === '/api/netease/start') {
        editable()
        const qr = await netease.createQrLogin()
        const id = randomUUID(); qrFlows.clear(); qrFlows.set(id, { key: qr.key, expiresAt: Date.now() + 300000 })
        return respond(res, 200, { id, image: qr.qrimg })
      }
      if (req.method === 'POST' && url.pathname === '/api/netease/check') {
        editable()
        const flow = qrFlows.get((await readBody(req)).id)
        if (!flow || flow.expiresAt < Date.now()) return respond(res, 200, { status: 'expired' })
        const result = await netease.checkQrLogin(flow.key)
        if (result.code === 803 && result.cookie.includes('MUSIC_U=')) {
          await store.update(state => { state.settings.neteaseCookie = result.cookie }); qrFlows.clear()
          return respond(res, 200, { status: 'connected' })
        }
        return respond(res, 200, { status: result.code === 800 ? 'expired' : result.code === 802 ? 'confirm' : 'waiting' })
      }
      if (req.method === 'POST' && url.pathname === '/api/spotify/connect') {
        editable()
        const input = await readBody(req)
        const id = String(input.clientId || '').trim()
        if (!/^[a-fA-F0-9]{32}$/.test(id)) throw new InstallerError('Client ID 应为 32 位字母数字，请从你自己的 Spotify 应用设置中复制。不要填写 Client Secret。')
        await store.update(state => {
          if (state.settings.spotifyClientId !== id) {
            const { requestTimes, retryAfterUntil, retryNotBefore, pauseReason, transientFailures } = state.spotify
            state.spotify = { requestTimes, retryAfterUntil, retryNotBefore, pauseReason, transientFailures }
          }
          state.settings.spotifyClientId = id; state.settings.scheduleEnabled = false
        })
        return respond(res, 200, { url: await spotify.beginAuthorization() })
      }
      if (req.method === 'GET' && url.pathname === '/auth/spotify/callback') {
        editable()
        if (url.searchParams.get('error')) { res.writeHead(302, { location: '/?spotify=denied' }); return res.end() }
        try {
          const oldOwner = store.state.setupSpotifyUserId || store.state.installer?.spotifyUserId
          const { profile } = await spotify.completeAuthorization(url.searchParams.get('code'), url.searchParams.get('state'))
          if (oldOwner && oldOwner !== profile.id) await store.update(state => { state.sync = { history: [] } })
          await store.update(state => { state.setupSpotifyUserId = profile.id })
          res.writeHead(302, { location: '/?spotify=connected' }); return res.end()
        } catch { res.writeHead(302, { location: '/?spotify=error' }); return res.end() }
      }
      if (req.method === 'POST' && url.pathname === '/api/deploy') {
        const input = await readBody(req)
        if (job) throw new InstallerError('部署正在进行。')
        if (!input.consent) throw new InstallerError('请先确认部署授权。')
        startJob(async () => {
          if (store.state.installer?.maintenance) await github.finishRenew(spotify)
          else await github.deployment(input, spotify)
          await store.update(state => { state.installer.spotifyUserId = state.setupSpotifyUserId })
          cloudReadAt = 0
        })
        return respond(res, 202, { started: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/cloud/status') {
        if (Date.now() - cloudReadAt > 15000) { cloud = await github.cloudStatus(); cloudReadAt = Date.now() }
        return respond(res, 200, cloud)
      }
      if (req.method === 'POST' && url.pathname === '/api/cloud/run') {
        if (job) throw new InstallerError('请等待当前操作结束。')
        return respond(res, 200, await github.dispatch())
      }
      if (req.method === 'POST' && url.pathname === '/api/cloud/reconnect') {
        if (job) throw new InstallerError('请等待当前操作结束。')
        startJob(async () => { await github.beginRenew(); github.progress = { status: 'idle', message: '已暂停云端同步，请重新连接需要更新的音乐账号，然后保存。' } })
        return respond(res, 202, { started: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/cloud/pause') {
        const input = await readBody(req)
        await github.profile()
        if (!store.state.installer?.deployed || !input.consent) throw new InstallerError('需要确认停用自动同步。')
        await github.api(`repos/${store.state.installer.repository}/actions/workflows/daily-sync.yml/disable`, 'PUT')
        await store.update(state => { state.installer.paused = true })
        return respond(res, 200, { paused: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/cloud/enable') {
        await github.profile()
        if (!store.state.installer?.deployed || store.state.installer.maintenance) throw new InstallerError('请先完成配置。')
        await github.api(`repos/${store.state.installer.repository}/actions/workflows/daily-sync.yml/enable`, 'PUT')
        await store.update(state => { state.installer.paused = false })
        return respond(res, 200, { enabled: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/exit') { if (job) throw new InstallerError('请等部署结束再退出。'); respond(res, 200, { closed: true }); server.close(); onExit(); return }
      const files = { '/': ['public/index.html', 'text/html'], '/styles.css': ['public/styles.css', 'text/css'], '/app.js': ['public/app.js', 'text/javascript'],
        '/setup.js': ['installer/setup.js', 'text/javascript'], '/setup.css': ['installer/setup.css', 'text/css'], '/setup-panels.html': ['installer/panels.html', 'text/html'],
        '/assets/daily-relay-cover-citypop-no-text.jpg': ['public/assets/daily-relay-cover-citypop-no-text.jpg', 'image/jpeg'] }
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname]
        let data = await readFile(path.join(ROOT, file))
        if (url.pathname === '/') data = data.toString('utf8').replace('</head>', '<meta name="daily-relay-mode" content="installer"><link rel="stylesheet" href="/setup.css"></head>')
        res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" })
        return res.end(data)
      }
      return respond(res, 404, { error: 'Not found' })
    } catch (error) {
      // Never echo upstream request bodies, cookies, OAuth codes or access tokens.
      const safe = installerMessage(error)
      if (!res.headersSent) respond(res, 400, { error: safe })
      else res.end()
    }
  })
  return { server, session, store, github, origin }
}
