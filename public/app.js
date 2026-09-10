// Both launch modes share the original interface. Only the server selects the
// controller; the installer never starts the legacy local-sync handlers.
if (document.querySelector('meta[name="daily-relay-mode"]')?.content === 'installer') {
  try { await import('/setup.js') } catch {
    const toast = document.getElementById('toast')
    toast.textContent = '安装引导未能加载，请退出并重新打开 Daily Relay App。'
    toast.classList.add('show', 'error')
  }
} else {
const $ = (selector) => document.querySelector(selector)

const elements = {
  pill: $('#connection-pill'),
  neteaseState: $('#netease-state'),
  spotifyState: $('#spotify-state'),
  neteaseCookie: $('#netease-cookie'),
  neteaseButton: $('#netease-button'),
  qrPanel: $('#qr-panel'),
  neteaseQr: $('#netease-qr'),
  qrTitle: $('#qr-title'),
  qrStatus: $('#qr-status'),
  spotifyClientId: $('#spotify-client-id'),
  spotifyButton: $('#spotify-button'),
  coverButton: $('#cover-button'),
  coverState: $('#cover-state'),
  saveButton: $('#save-settings'),
  syncButton: $('#sync-button'),
  playlistLink: $('#playlist-link'),
  playlistName: $('#playlist-name'),
  playlistPublic: $('#playlist-public'),
  scheduleEnabled: $('#schedule-enabled'),
  scheduleHour: $('#schedule-hour'),
  timezone: $('#timezone'),
  redirectUri: $('#redirect-uri'),
  lastRun: $('#last-run'),
  matchCount: $('#match-count'),
  nextSync: $('#next-sync'),
  resultDate: $('#result-date'),
  empty: $('#empty-state'),
  results: $('#results'),
  resultSummary: $('#result-summary'),
  trackList: $('#track-list'),
  unmatchedDetails: $('#unmatched-details'),
  unmatchedList: $('#unmatched-list'),
  toast: $('#toast'),
  help: $('#setup-help'),
}

let status
let toastTimer
let qrTimer

function showToast(message, error = false) {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.toggle('error', error)
  elements.toast.classList.add('show')
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3600)
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
  return result
}

function fillSelects() {
  for (let hour = 0; hour < 24; hour += 1) {
    const label = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true }).format(new Date(2020, 0, 1, hour))
    elements.scheduleHour.add(new Option(label, hour))
  }
  const preferred = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney']
  const zones = [...new Set([...preferred, Intl.DateTimeFormat().resolvedOptions().timeZone, ...Intl.supportedValuesOf('timeZone')])]
  for (const zone of zones) elements.timezone.add(new Option(zone.replaceAll('_', ' '), zone))
}

function renderRun(run) {
  if (!run) {
    elements.empty.classList.remove('hidden')
    elements.results.classList.add('hidden')
    return
  }
  elements.resultDate.textContent = run.ok ? run.date : 'Last attempt failed'
  if (!run.ok) {
    elements.empty.classList.remove('hidden')
    elements.empty.querySelector('p').textContent = run.error
    elements.results.classList.add('hidden')
    return
  }
  elements.empty.classList.add('hidden')
  elements.results.classList.remove('hidden')
  elements.resultSummary.textContent = `${run.matchedCount} of ${run.sourceCount} NetEase tracks matched on Spotify · playlist order preserved`
  elements.trackList.replaceChildren()
  for (const [index, match] of (run.matches || []).entries()) {
    const row = document.createElement('div')
    row.className = 'track'
    const number = document.createElement('span')
    number.className = 'track-number'
    number.textContent = String(index + 1).padStart(2, '0')
    const title = document.createElement('div')
    title.className = 'track-title'
    const link = document.createElement('a')
    link.href = match.spotify.url || '#'
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = match.spotify.name
    const artist = document.createElement('small')
    artist.textContent = ` · ${match.spotify.artists.join(', ')}`
    link.append(artist)
    title.append(link)
    const source = document.createElement('span')
    source.className = 'track-source'
    source.textContent = `from ${match.source.name}`
    const score = document.createElement('span')
    score.className = 'track-score'
    score.textContent = match.alternateVersion ? '替代版本' : `${Math.round(match.score * 100)}%`
    if (match.alternateVersion) score.title = `同一歌手、同一首歌的替代版本 · ${match.spotify.album || ''}`
    row.append(number, title, source, score)
    elements.trackList.append(row)
  }
  const unmatched = run.unmatched || []
  elements.unmatchedDetails.classList.toggle('hidden', unmatched.length === 0)
  elements.unmatchedList.replaceChildren(...unmatched.map((song) => {
    const item = document.createElement('li')
    item.textContent = `${song.name} — ${song.artists.join(', ')}`
    return item
  }))
}

function render(data, hydrate = true) {
  status = data
  const ready = data.settings.hasNeteaseCookie && data.spotify.connected
  elements.pill.classList.toggle('ready', ready)
  elements.pill.lastChild.textContent = ready ? ' Ready to sync' : ' Setup needed'
  elements.neteaseState.textContent = data.settings.hasNeteaseCookie ? 'Cookie saved' : 'Not connected'
  elements.neteaseState.classList.toggle('connected', data.settings.hasNeteaseCookie)
  elements.neteaseButton.textContent = data.settings.hasNeteaseCookie ? 'Disconnect NetEase' : 'Connect with QR code'
  elements.spotifyState.textContent = data.spotify.connected ? `Connected · ${data.spotify.displayName || 'Spotify'}` : 'Not connected'
  elements.spotifyState.classList.toggle('connected', data.spotify.connected)
  elements.spotifyButton.textContent = data.spotify.connected ? 'Disconnect Spotify' : 'Save & connect Spotify'
  const coverApplied = data.sync.coverApplied && data.sync.coverUploadedAt
  elements.coverState.textContent = coverApplied
    ? `Applied ${new Date(data.sync.coverUploadedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'Ready to replace Spotify’s automatic album collage.'
  elements.coverButton.disabled = !data.spotify.connected || !data.sync.playlistUrl
  elements.coverButton.textContent = !data.spotify.connected
    ? 'Connect Spotify first'
    : !data.sync.playlistUrl
      ? 'Sync once first'
      : data.spotify.canUploadCover
        ? 'Apply cover'
        : 'Authorize & apply cover'
  elements.syncButton.disabled = !ready
  elements.help.textContent = ready ? 'Both services are ready. Save any playlist or schedule changes.' : 'Add both account connections to enable syncing.'
  elements.redirectUri.textContent = data.redirectUri
  elements.playlistLink.classList.toggle('hidden', !data.sync.playlistUrl)
  if (data.sync.playlistUrl) elements.playlistLink.href = data.sync.playlistUrl
  const run = data.sync.lastRun
  elements.lastRun.textContent = run?.finishedAt ? new Date(run.finishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet'
  elements.matchCount.textContent = run?.ok ? `${run.matchedCount} / ${run.sourceCount}` : '—'
  elements.nextSync.textContent = data.settings.scheduleEnabled ? `${String(data.settings.scheduleHour).padStart(2, '0')}:00 daily` : 'Manual only'
  if (hydrate) {
    elements.spotifyClientId.value = data.settings.spotifyClientId || ''
    elements.playlistName.value = data.settings.playlistName
    elements.playlistPublic.checked = data.settings.playlistPublic
    elements.scheduleEnabled.checked = data.settings.scheduleEnabled
    elements.scheduleHour.value = data.settings.scheduleHour
    elements.timezone.value = data.settings.timezone
    if (!elements.timezone.value) {
      elements.timezone.add(new Option(data.settings.timezone.replaceAll('_', ' '), data.settings.timezone))
      elements.timezone.value = data.settings.timezone
    }
  }
  renderRun(run)
}

function settingsBody() {
  return {
    spotifyClientId: elements.spotifyClientId.value.trim(),
    neteaseCookie: elements.neteaseCookie.value.trim(),
    playlistName: elements.playlistName.value.trim() || 'NetEase Daily Recommendations',
    playlistPublic: elements.playlistPublic.checked,
    scheduleEnabled: elements.scheduleEnabled.checked,
    scheduleHour: Number(elements.scheduleHour.value),
    timezone: elements.timezone.value,
  }
}

async function saveSettings() {
  const updated = await api('/api/settings', { method: 'POST', body: JSON.stringify(settingsBody()) })
  elements.neteaseCookie.value = ''
  render(updated)
  showToast('Setup saved on this computer')
  return updated
}

elements.saveButton.addEventListener('click', async () => {
  try { await saveSettings() } catch (error) { showToast(error.message, true) }
})

elements.spotifyButton.addEventListener('click', async () => {
  try {
    if (status.spotify.connected) {
      render(await api('/api/spotify/disconnect', { method: 'POST' }))
      showToast('Spotify disconnected')
    } else {
      await saveSettings()
      window.location.assign('/auth/spotify')
    }
  } catch (error) { showToast(error.message, true) }
})

elements.coverButton.addEventListener('click', async () => {
  try {
    if (!status.spotify.canUploadCover) {
      await saveSettings()
      window.location.assign('/auth/spotify?applyCover=1')
      return
    }
    elements.coverButton.disabled = true
    elements.coverButton.textContent = 'Applying…'
    await api('/api/playlist/cover', { method: 'POST' })
    render(await api('/api/status'), false)
    showToast('Custom playlist cover applied')
  } catch (error) {
    showToast(error.message, true)
  } finally {
    if (status) render(status, false)
  }
})

async function pollQr(flowId) {
  clearTimeout(qrTimer)
  try {
    const result = await api(`/api/netease/qr/status?flowId=${encodeURIComponent(flowId)}`)
    elements.qrStatus.textContent = result.message
    if (result.status === 'connected') {
      elements.qrTitle.textContent = 'Connected'
      elements.qrPanel.classList.add('hidden')
      render(await api('/api/status'), false)
      showToast('NetEase connected successfully')
      return
    }
    if (result.status === 'expired') {
      elements.qrTitle.textContent = 'QR code expired'
      elements.neteaseButton.textContent = 'Create a new QR code'
      return
    }
    elements.qrTitle.textContent = result.status === 'confirm' ? 'Almost there' : 'Scan this code'
    qrTimer = setTimeout(() => pollQr(flowId), 2000)
  } catch (error) {
    elements.qrStatus.textContent = error.message
    showToast(error.message, true)
  }
}

elements.neteaseButton.addEventListener('click', async () => {
  try {
    if (status.settings.hasNeteaseCookie) {
      clearTimeout(qrTimer)
      elements.qrPanel.classList.add('hidden')
      render(await api('/api/netease/disconnect', { method: 'POST' }))
      showToast('NetEase disconnected')
      return
    }
    elements.neteaseButton.disabled = true
    elements.neteaseButton.textContent = 'Creating QR code…'
    const result = await api('/api/netease/qr/start', { method: 'POST' })
    elements.neteaseQr.src = result.qrimg
    elements.qrTitle.textContent = 'Scan this code'
    elements.qrStatus.textContent = 'Open NetEase on your phone and scan'
    elements.qrPanel.classList.remove('hidden')
    elements.neteaseButton.textContent = 'Refresh QR code'
    pollQr(result.flowId)
  } catch (error) {
    showToast(error.message, true)
    elements.neteaseButton.textContent = 'Connect with QR code'
  } finally {
    elements.neteaseButton.disabled = false
  }
})

elements.syncButton.addEventListener('click', async () => {
  elements.syncButton.disabled = true
  elements.syncButton.classList.add('is-loading')
  elements.syncButton.lastChild.textContent = ' Matching tracks…'
  try {
    const run = await api('/api/sync', { method: 'POST' })
    renderRun(run)
    render(await api('/api/status'), false)
    showToast(`Playlist updated with ${run.matchedCount} tracks`)
  } catch (error) {
    showToast(error.message, true)
  } finally {
    elements.syncButton.classList.remove('is-loading')
    elements.syncButton.lastChild.textContent = ' Sync today’s mix'
    elements.syncButton.disabled = !(status?.settings.hasNeteaseCookie && status?.spotify.connected)
  }
})

for (const button of document.querySelectorAll('[data-reveal]')) {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.reveal)
    input.type = input.type === 'password' ? 'text' : 'password'
    button.textContent = input.type === 'password' ? 'Show' : 'Hide'
  })
}

$('#copy-redirect').addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.redirectUri.textContent)
  showToast('Redirect URI copied')
})

fillSelects()

try {
  render(await api('/api/status'))
  const query = new URLSearchParams(location.search)
  if (query.get('spotify') === 'connected') showToast('Spotify connected successfully')
  if (query.get('cover') === 'applied') showToast('Spotify connected and custom cover applied')
  if (query.get('cover') === 'error') showToast(query.get('message') || 'Could not apply the cover', true)
  if (query.get('spotify') === 'denied') showToast('Spotify access was not granted', true)
  if (query.get('spotify') === 'error') showToast(query.get('message') || 'Spotify connection failed', true)
  if (query.has('spotify')) history.replaceState({}, '', '/')
} catch (error) {
  showToast(error.message, true)
}
}
