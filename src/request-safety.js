const HOUR = 60 * 60_000

// Retire only the old application's 60/hour pause. Provider and network
// deadlines, reservations and query checkpoints must survive the upgrade.
export async function migrateRequestBudget(store) {
  if (store.state.spotify.budgetPolicyVersion === 2) return
  await store.update(state => {
    if (state.spotify.pauseReason === 'request-budget') {
      delete state.spotify.retryNotBefore
      delete state.spotify.pauseReason
    }
    state.spotify.budgetPolicyVersion = 2
  })
}

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
  constructor(store, { sleep, now = Date.now, minIntervalMs = 6000, maxPerRun = 300, maxPerHour = Infinity,
    maxPerWindow = 5, windowMs = 30_000 } = {}) {
    this.store = store
    this.sleep = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.now = now
    this.minIntervalMs = minIntervalMs
    this.maxPerRun = maxPerRun
    this.maxPerHour = maxPerHour
    this.maxPerWindow = maxPerWindow
    this.windowMs = windowMs
    this.beginRun()
    this.queue = Promise.resolve()
  }

  beginRun() {
    this.stats = { requests: 0, cacheHits: 0, retries: 0, lastStatus: null, lastOperation: null }
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
    const operation = this.queue.then(() => this.fetchWithRetries(fetchImpl, url, options))
    this.queue = operation.catch(() => {})
    return operation
  }

  async fetchWithRetries(fetchImpl, url, options) {
    // Retry only reads: a timed-out token rotation or playlist POST may have
    // already taken effect. Never replay these ambiguous writes automatically.
    const readOnly = ['GET', 'HEAD'].includes((options?.method || 'GET').toUpperCase())
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.sendOnce(fetchImpl, url, options)
        if (this.store.state.spotify.pauseReason === 'transient-retry') {
          await this.store.update(state => {
            delete state.spotify.retryNotBefore
            delete state.spotify.pauseReason
          })
        }
        return response
      } catch (error) {
        if (!error.transient) throw error // In particular: never retry a 429.
        const until = Math.max(this.now() + [2000, 8000][Math.min(attempt, 1)],
          error.retryAfter ? retryDeadline(error.retryAfter, this.now()) : 0)
        if (!readOnly || attempt >= 2 || until - this.now() > 60_000) {
          throw await this.transient(error.status, error.retryAfter)
        }
        // Persist BEFORE waiting: crashes/new runners cannot bypass the wait.
        await this.backoff('transient-retry', until)
        this.stats.retries++
        await this.sleep(Math.max(0, until - this.now()))
      }
    }
  }

  async sendOnce(fetchImpl, url, options) {
      this.check()
      let previous = this.store.state.spotify.requestTimes || []
      const wait = Math.max(0, (previous.at(-1) || 0) + this.minIntervalMs - this.now())
      if (wait) await this.sleep(wait)
      this.check()
      // A short rolling-window wait stays inside this run instead of turning a
      // normal full scan into an hour-long failure. Recheck after every wait.
      for (;;) {
        previous = this.store.state.spotify.requestTimes || []
        const window = previous.filter(time => time > this.now() - this.windowMs).sort((a, b) => a - b)
        if (window.length < this.maxPerWindow) break
        await this.sleep(Math.max(1, window[window.length - this.maxPerWindow] + this.windowMs - this.now()))
        this.check()
      }
      const now = this.now()
      const recent = previous.filter(time => time > now - HOUR)
      if (this.stats.requests >= this.maxPerRun) {
        throw await this.backoff('run-budget', now + 15 * 60_000)
      }
      if (recent.length >= this.maxPerHour) {
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
      this.stats.lastStatus = null
      try { response = await fetchImpl(url, options) }
      catch { throw Object.assign(new Error('network-error'), { transient: true }) }
      this.stats.lastStatus = response.status
      if (response.status === 429) {
        const until = retryDeadline(response.headers?.get('retry-after'), this.now())
        await this.store.update(state => {
          state.spotify.retryAfterUntil = Math.max(state.spotify.retryAfterUntil || 0, until)
        })
        throw pauseError('provider-cooldown', this.store.state.spotify.retryAfterUntil, 429)
      }
      if (response.status >= 500) throw Object.assign(new Error('provider-error'), {
        transient: true, status: response.status, retryAfter: response.headers?.get('retry-after'),
      })
      return response
  }
}
