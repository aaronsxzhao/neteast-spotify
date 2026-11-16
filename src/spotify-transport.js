import https from 'node:https'

// One HTTP attempt only. RequestSafety owns pacing, retries and cooldowns.
// Native HTTPS avoids the failing fetch address-family connection path on
// affected local networks. Spotify endpoints support IPv4; do not follow
// redirects carrying authorization headers to another origin.
export function createSpotifyTransport(request = https.request, timeoutMs = 30_000) {
  return async function spotifyTransport(url, options = {}) {
    const target = new URL(url)
    if (target.protocol !== 'https:' || !['api.spotify.com', 'accounts.spotify.com'].includes(target.hostname) ||
      target.port || target.username || target.password) throw new Error('Invalid Spotify endpoint')
    const body = options.body == null ? null : Buffer.from(String(options.body))
    const headers = Object.fromEntries(new Headers(options.headers).entries())
    if (body) headers['content-length'] = String(body.length)
    return new Promise((resolve, reject) => {
      let response, settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        if (error) { req.destroy(); response?.destroy(); reject(error) }
        else resolve(value)
      }
      const abort = () => finish(options.signal.reason || new DOMException('Cancelled', 'AbortError'))
      const req = request(target, { method: options.method || 'GET', headers, family: 4 }, incoming => {
        response = incoming
        const chunks = []; let bytes = 0
        incoming.on('data', chunk => {
          bytes += chunk.length
          if (bytes > 8 * 1024 * 1024) return finish(Object.assign(new Error('Spotify response too large'), { code: 'RESPONSE_TOO_LARGE' }))
          chunks.push(Buffer.from(chunk))
        })
        incoming.on('error', finish)
        incoming.on('aborted', () => finish(Object.assign(new Error('Response interrupted'), { code: 'ECONNRESET' })))
        incoming.on('end', () => {
          try {
            const status = incoming.statusCode
            finish(null, new Response([204, 304].includes(status) ? null : Buffer.concat(chunks),
              { status, statusText: incoming.statusMessage, headers: incoming.headers }))
          } catch (error) { finish(error) }
        })
      })
      const timer = setTimeout(() => finish(new DOMException('Spotify request timed out', 'TimeoutError')), timeoutMs)
      req.on('error', finish)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) return abort()
      req.end(body)
    })
  }
}
export const spotifyFetch = createSpotifyTransport()
