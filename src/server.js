import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ORIGIN, HOST, PORT, SPOTIFY_REDIRECT_URI } from './config.js'
import { Store } from './store.js'
import { SpotifyClient } from './spotify.js'
import { SyncService } from './sync.js'
import { checkQrLogin, createQrLogin } from './netease.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUBLIC_DIR = path.join(ROOT, 'public')
const COVER_PATH = path.join(PUBLIC_DIR, 'assets', 'daily-relay-cover-citypop-no-text.jpg')
const store = new Store()
await store.load()
const spotify = new SpotifyClient(store)
const syncService = new SyncService(store, spotify)
const qrLogins = new Map()

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function applyPlaylistCover() {
  const playlistId = store.state.sync.playlistId
  if (!playlistId) throw new Error('Sync the playlist once before applying its cover')
  if (!spotify.hasScope('ugc-image-upload')) {
    const error = new Error('Reconnect Spotify once to authorize custom cover uploads')
    error.status = 403
    throw error
  }

  const jpeg = await readFile(COVER_PATH)
  if (jpeg.length > 256 * 1024) throw new Error('Playlist cover must be no larger than 256 KB')
  await spotify.uploadPlaylistCover(playlistId, jpeg.toString('base64'))
  const uploadedAt = new Date().toISOString()
  await store.update((data) => {
    data.sync.coverUploadedAt = uploadedAt
    data.sync.coverUploadedForPlaylistId = playlistId
  })
  return { ok: true, playlistId, uploadedAt }
}

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function redirect(response, location) {
  response.writeHead(302, { location, 'cache-control': 'no-store' })
  response.end()
}

async function body(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 64_000) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function publicStatus() {
  const { settings, spotify: auth, sync } = store.state
  return {
    settings: {
      spotifyClientId: settings.spotifyClientId,
      hasNeteaseCookie: Boolean(settings.neteaseCookie),
      playlistName: settings.playlistName,
      playlistPublic: settings.playlistPublic,
      scheduleEnabled: settings.scheduleEnabled,
      scheduleHour: settings.scheduleHour,
      timezone: settings.timezone,
    },
    spotify: {
      connected: Boolean(auth.refreshToken),
      displayName: auth.profile?.displayName,
      canUploadCover: spotify.hasScope('ugc-image-upload'),
    },
    sync: {
      playlistUrl: sync.playlistUrl,
      coverUrl: '/assets/daily-relay-cover-citypop-no-text.jpg',
      coverApplied: Boolean(sync.coverUploadedAt && sync.coverUploadedForPlaylistId === sync.playlistId),
      coverUploadedAt: sync.coverUploadedAt,
      lastSyncedDate: sync.lastSyncedDate,
      lastRun: sync.lastRun,
      history: (sync.history || []).map((run) => ({
        ok: run.ok,
        date: run.date,
        finishedAt: run.finishedAt,
        matchedCount: run.matchedCount,
        sourceCount: run.sourceCount,
        error: run.error,
      })),
    },
    redirectUri: SPOTIFY_REDIRECT_URI,
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return json(response, 200, publicStatus())
  }

  if (request.method === 'POST' && url.pathname === '/api/settings') {
    const input = await body(request)
    const hour = Number(input.scheduleHour)
    if (input.spotifyClientId !== undefined && !/^[a-zA-Z0-9]{20,64}$/.test(input.spotifyClientId.trim())) {
      return json(response, 400, { error: 'Spotify Client ID does not look valid' })
    }
    if (input.timezone && !Intl.supportedValuesOf('timeZone').includes(input.timezone)) {
      return json(response, 400, { error: 'Choose a valid timezone' })
    }
    if (input.scheduleHour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
      return json(response, 400, { error: 'Schedule hour must be between 0 and 23' })
    }
    await store.update((data) => {
      const previousClientId = data.settings.spotifyClientId
      const allowed = ['spotifyClientId', 'playlistName', 'playlistPublic', 'scheduleEnabled', 'scheduleHour', 'timezone']
      for (const key of allowed) if (input[key] !== undefined) data.settings[key] = input[key]
      if (input.spotifyClientId !== undefined && previousClientId && input.spotifyClientId !== previousClientId) {
        data.spotify = {}
      }
      if (input.neteaseCookie?.trim()) data.settings.neteaseCookie = input.neteaseCookie.trim()
      if (input.clearNeteaseCookie) data.settings.neteaseCookie = ''
    })
    return json(response, 200, publicStatus())
  }

  if (request.method === 'POST' && url.pathname === '/api/netease/qr/start') {
    const qr = await createQrLogin()
    const flowId = randomUUID()
    qrLogins.set(flowId, { key: qr.key, expiresAt: Date.now() + 5 * 60_000 })
    return json(response, 200, { flowId, qrimg: qr.qrimg, expiresIn: 300 })
  }

  if (request.method === 'GET' && url.pathname === '/api/netease/qr/status') {
    const flowId = url.searchParams.get('flowId')
    const flow = qrLogins.get(flowId)
    if (!flow || flow.expiresAt < Date.now()) {
      if (flowId) qrLogins.delete(flowId)
      return json(response, 200, { status: 'expired', message: 'QR code expired' })
    }
    const result = await checkQrLogin(flow.key)
    if (result.code === 803) {
      if (!result.cookie.includes('MUSIC_U=')) {
        return json(response, 502, { error: 'NetEase approved the login but did not return MUSIC_U; please create a new QR code' })
      }
      await store.update((data) => { data.settings.neteaseCookie = result.cookie })
      qrLogins.delete(flowId)
      return json(response, 200, { status: 'connected', message: 'NetEase connected' })
    }
    if (result.code === 800) {
      qrLogins.delete(flowId)
      return json(response, 200, { status: 'expired', message: 'QR code expired' })
    }
    if (result.code === 802) return json(response, 200, { status: 'confirm', message: 'Confirm login in the NetEase app' })
    return json(response, 200, { status: 'waiting', message: 'Scan with the NetEase mobile app' })
  }

  if (request.method === 'POST' && url.pathname === '/api/netease/disconnect') {
    await store.update((data) => { data.settings.neteaseCookie = '' })
    return json(response, 200, publicStatus())
  }

  if (request.method === 'GET' && url.pathname === '/auth/spotify') {
    const action = url.searchParams.get('applyCover') === '1' ? 'apply-cover' : null
    return redirect(response, await spotify.beginAuthorization(action))
  }

  if (request.method === 'GET' && url.pathname === '/auth/spotify/callback') {
    if (url.searchParams.get('error')) return redirect(response, '/?spotify=denied')
    try {
      const result = await spotify.completeAuthorization(url.searchParams.get('code'), url.searchParams.get('state'))
      let destination = '/?spotify=connected'
      if (result.action === 'apply-cover') {
        try {
          await applyPlaylistCover()
          destination += '&cover=applied'
        } catch (error) {
          destination += `&cover=error&message=${encodeURIComponent(error.message)}`
        }
      }
      return redirect(response, destination)
    } catch (error) {
      return redirect(response, `/?spotify=error&message=${encodeURIComponent(error.message)}`)
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/spotify/disconnect') {
    await spotify.disconnect()
    return json(response, 200, publicStatus())
  }

  if (request.method === 'POST' && url.pathname === '/api/sync') {
    const result = await syncService.run({ scheduled: false })
    return json(response, 200, result)
  }

  if (request.method === 'POST' && url.pathname === '/api/playlist/cover') {
    return json(response, 200, await applyPlaylistCover())
  }

  return false
}

async function serveStatic(response, url) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const target = path.resolve(PUBLIC_DIR, `.${pathname}`)
  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`)) return json(response, 403, { error: 'Forbidden' })
  try {
    const file = await readFile(target)
    response.writeHead(200, {
      'content-type': contentTypes[path.extname(target)] || 'application/octet-stream',
      'cache-control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    })
    response.end(file)
  } catch (error) {
    if (error.code === 'ENOENT') return json(response, 404, { error: 'Not found' })
    throw error
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, APP_ORIGIN)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      const handled = await handleApi(request, response, url)
      if (handled !== false) return
      return json(response, 404, { error: 'Not found' })
    }
    await serveStatic(response, url)
  } catch (error) {
    console.error(`[${new Date().toISOString()}]`, error.message)
    if (!response.headersSent) json(response, error.status || 500, { error: error.message })
    else response.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`NetEase → Spotify is running at ${APP_ORIGIN}`)
  console.log(`Spotify redirect URI: ${SPOTIFY_REDIRECT_URI}`)
})

setInterval(async () => {
  if (!syncService.shouldRun()) return
  try {
    await syncService.run({ scheduled: true })
    console.log(`[${new Date().toISOString()}] Daily playlist sync completed`)
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scheduled sync failed: ${error.message}`)
  }
}, 60_000).unref()
