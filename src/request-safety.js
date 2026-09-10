const HOUR = 60 * 60_000

export function pauseError(reason, until, status) {
  return Object.assign(new Error(reason), { name: 'SyncPaused', pauseReason: reason, retryAt: until, status })
}

export function retryDeadline(value, now, fallbackSeconds = 60) {
  const seconds = value?.trim() ? Number(value) : NaN
  const date = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(value)
  return Number.isFinite(date) && date > now ? date : now + fallbackSeconds * 1000
}

// These are our conservative limits, NOT a claim about Spotify's quota.
// Persist reservations BEFORE requests so fresh runners cannot reset budgets.
export class RequestSafety {
  constructor(store, { sleep, now = Date.now, minIntervalMs = 2000, maxPerRun = 60, maxPerHour = 60 } = {}) {
    this.store = store
    this.sleep = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.now = now
    this.minIntervalMs = minIntervalMs
    this.maxPerRun = maxPerRun
    this.maxPerHour = maxPerHour
    this.beginRun()
    this.queue = Promise.resolve()
  }

  beginRun() {
    this.stats = { requests: 0, cacheHits: 0, lastStatus: null, lastOperation: null }
  }

  check() {
    const state = this.store.state.spotify
    const now = this.now()
    if (state.retryAfterUntil > now) throw pauseError('provider-cooldown', state.retryAfterUntil, 429)
    if (state.retryNotBefore > now) throw pauseError(state.pauseReason || 'local-backoff', state.retryNotBefore)
  }

  async backoff(reason, until) {
    await this.store.update(state => {
      state.spotify.retryNotBefore = Math.max(state.spotify.retryNotBefore || 0, until)
      state.spotify.pauseReason = reason
    })
    return pauseError(reason, this.store.state.spotify.retryNotBefore)
  }

  async transient(status, retryAfter) {
    const failures = (this.store.state.spotify.transientFailures || 0) + 1
    const until = Math.max(this.now() + Math.min(4 * HOUR, 15 * 60_000 * 2 ** Math.min(failures - 1, 4)),
      retryAfter ? retryDeadline(retryAfter, this.now()) : 0)
    await this.store.update(state => { state.spotify.transientFailures = failures })
    const error = await this.backoff('transient-backoff', until)
    error.status = status
    return error
  }

  fetch(fetchImpl, url, options) {
    const operation = this.queue.then(async () => {
      this.check()
      const previous = this.store.state.spotify.requestTimes || []
      const wait = Math.max(0, (previous.at(-1) || 0) + this.minIntervalMs - this.now())
      if (wait) await this.sleep(wait)
      this.check()
      const now = this.now()
      const recent = previous.filter(time => time > now - HOUR)
      if (this.stats.requests >= this.maxPerRun || recent.length >= this.maxPerHour) {
        throw await this.backoff('request-budget', Math.max(now + 15 * 60_000, (recent[0] || now) + HOUR))
      }
      await this.store.update(state => { state.spotify.requestTimes = [...recent, now] })
      // Storage latency varies: also pace against the actual previous send,
      // not only its earlier persisted reservation timestamp.
      const remaining = Math.max(0, (this.lastSentAt ?? 0) + this.minIntervalMs - this.now())
      if (remaining) await this.sleep(remaining)
      this.check()
      this.lastSentAt = this.now()
      this.stats.requests++
      this.stats.lastOperation = url.includes('/api/token') ? 'authorization' : url.includes('/search?') ? 'search' : 'playlist-or-profile'
      let response
      try { response = await fetchImpl(url, options) }
      catch { throw await this.transient(undefined) }
      this.stats.lastStatus = response.status
      if (response.status === 429) {
        const until = retryDeadline(response.headers?.get('retry-after'), this.now())
        await this.store.update(state => {
          state.spotify.retryAfterUntil = Math.max(state.spotify.retryAfterUntil || 0, until)
        })
        throw pauseError('provider-cooldown', this.store.state.spotify.retryAfterUntil, 429)
      }
      if (response.status >= 500) throw await this.transient(response.status, response.headers?.get('retry-after'))
      return response
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}
