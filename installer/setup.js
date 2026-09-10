// Adapt the existing frontend instead of maintaining another full interface.
const response = await fetch('/setup-panels.html')
if (!response.ok) throw new Error('安装引导未加载，请重新打开 App。')
const panels = new DOMParser().parseFromString(await response.text(), 'text/html')
const fragment = id => panels.getElementById(id).content.cloneNode(true)
document.documentElement.lang = 'zh-CN'
document.body.classList.add('installer-mode')
document.title = 'Daily Relay · 我的每日同步'
document.querySelector('.hero h1').innerHTML = '每天的好歌，<br><em>自动送到 Spotify。</em>'
document.querySelector('.hero-copy').textContent = '连接你自己的账号，助手配置每日同步。安装完成后可以关机；无需终端，无需操作 GitHub 仓库。'
document.querySelector('.vinyl-label strong').textContent = '↗'
document.querySelector('.vinyl-label span:last-child').textContent = 'RELAY'
const connection = document.querySelector('.workspace')
connection.querySelector('h2').textContent = '连接你的音乐'
connection.querySelector('.section-heading > p').textContent = '使用你自己的网易云与 Spotify。音乐凭证先存本机，确认部署后保存到你自己的 GitHub Secrets。'
connection.querySelector('.section-heading').after(fragment('install-progress'))
const cards = connection.querySelectorAll('.setup-card')
cards[0].querySelector('h3').textContent = '网易云音乐'
cards[0].querySelector('p').textContent = '用网易云音乐手机 App 扫码，并在手机上确认。二维码过期后可重新生成。'
cards[1].querySelector('p').textContent = '使用你自己的 Spotify 开发者应用。首次需按指引创建应用并复制 Client ID，不需要 Client Secret。'
cards[1].querySelector('label').before(fragment('install-spotify-guide'))
document.getElementById('spotify-client-id').placeholder = '粘贴你自己的 32 位 Client ID'
document.getElementById('netease-button').textContent = '扫码连接网易云'
document.getElementById('spotify-button').textContent = '保存并连接 Spotify'
document.getElementById('qr-title').textContent = '请扫码登录'
document.getElementById('copy-redirect').textContent = '复制回调地址'
connection.querySelector('.manual-login').remove()
connection.querySelector('.save-bar').remove()
connection.append(fragment('install-manual-sync'))
const cover = document.querySelector('.cover-card')
cover.querySelector('#cover-button').remove()
cover.querySelector('#cover-state').textContent = 'Daily Relay · 每天的音乐，流转到新的地方。'
document.querySelector('.schedule-section').replaceChildren(fragment('install-cloud-setup'))
document.querySelector('.results-section').replaceChildren(fragment('install-cloud-status'), cover)
const footer = document.querySelector('footer')
footer.querySelector('p').textContent = '不下载音频，只同步歌单。独立于网易云与 Spotify。'
const exit = document.createElement('button'); exit.id = 'exit'; exit.className = 'button button-outline'; exit.textContent = '退出安装助手'; footer.append(exit)
document.getElementById('sync-button').textContent = '立即同步'
document.getElementById('playlist-link').textContent = '在 Spotify 打开 ↗'
const labels = document.querySelectorAll('.status-strip .status-kicker')
;['上次成功', '已匹配', '每日同步'].forEach((label, i) => { labels[i].textContent = label })
const aliases = { 'netease-status': 'netease-state', 'netease-connect': 'netease-button', 'spotify-status': 'spotify-state', 'spotify-connect': 'spotify-button', 'client-id': 'spotify-client-id', redirect: 'redirect-uri', qr: 'netease-qr', 'qr-message': 'qr-status', 'sync-now': 'sync-button', playlist: 'playlist-link' }
const $ = id => document.getElementById(aliases[id] || id)
// Original components use .hidden; installer state uses the native hidden flag.
for (const id of ['qr-panel', 'playlist']) { $(id).classList.remove('hidden'); $(id).hidden = true }
let current; let qrTimer; let pollBusy = false; let cloudBusy = false; let firstCloud = true; let closed = false
const timers = []
function notice(text, error = false) { $('notice').textContent = text; $('notice').hidden = false; $('notice').classList.toggle('error', error) }
async function api(route, data) {
  const response = await fetch(route, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '操作失败，请重试。')
  return body
}
function bind(id, work) { $(id).addEventListener('click', async () => { $(id).disabled = true; try { await work() } catch (e) { notice(e.message, true) } finally { $(id).disabled = false; await refresh() } }) }
const dateText = millis => new Date(millis).toLocaleString('zh-CN', { hour12: false })
function render(data) {
  current = data
  $('netease-status').textContent = data.netease ? '已连接' : '未连接'
  $('spotify-status').textContent = data.spotify ? `已连接 ${data.spotifyName || ''}` : '未连接'
  $('netease-status').classList.toggle('connected', data.netease)
  $('spotify-status').classList.toggle('connected', data.spotify)
  $('connection-pill').textContent = data.deployed ? '个人云端已配置' : data.netease && data.spotify ? '可手动同步' : '完成账号连接'
  const report = data.deployed ? data.cloud : data.manual
  $('last-run').textContent = report?.lastSyncedDate || '尚无成功记录'
  $('match-count').textContent = report?.lastSyncedDate ? `${report.matchedCount}/${report.sourceCount}` : '—'
  $('next-sync').textContent = data.paused ? '已暂停' : data.deployed ? '北京时间 08:00 起' : '未开启 · 可手动同步'
  $('redirect').textContent = data.redirectUri
  if (!$('client-id').value && data.clientId) $('client-id').value = data.clientId
  $('github-status').textContent = data.github.status === 'connected' ? `已授权 ${data.github.login}` : data.github.status === 'waiting' ? '等待确认' : '未授权'
  $('github-code-panel').hidden = data.github.status !== 'waiting'
  $('github-code').textContent = data.github.code || ''
  if (data.github.status === 'error') notice(data.github.message, true)
  const locked = data.busy || (data.deployed && !data.maintenance)
  $('netease-connect').disabled = locked
  $('spotify-connect').disabled = locked
  $('client-id').disabled = locked
  $('github-connect').disabled = data.busy || ['starting', 'waiting'].includes(data.github.status) || !$('github-consent').checked
  $('github-connect').textContent = data.github.status === 'connected' ? '重新授权 GitHub' : '连接我的 GitHub'
  const ready = data.netease && data.spotify && data.github.status === 'connected'
  $('deploy').disabled = !ready || data.busy || (data.deployed && !data.maintenance) || !$('deploy-consent').checked
  $('deploy').textContent = data.maintenance ? '保存新授权并恢复自动同步' : data.deployed ? '云端已配置' : data.busy ? '正在自动配置…' : '开启我的每日同步'
  $('deploy-status').textContent = data.deployment.message || ''
  if (data.deployment.status === 'error') notice(data.deployment.message, true)
  $('cloud-panel').hidden = !data.deployed
  $('cloud-empty').hidden = data.deployed
  renderManual(data)
  $('repo-name').textContent = data.repository ? `你的仓库：${data.repository}` : ''
  if (data.repository && data.visibility) $('visibility').value = data.visibility
  $('visibility').disabled = Boolean(data.repository) || data.busy
  $('step-n').classList.toggle('done', data.netease)
  $('step-s').classList.toggle('done', data.spotify)
  $('step-g').classList.toggle('done', data.github.status === 'connected')
  $('step-d').classList.toggle('done', data.deployed && Boolean(data.cloud?.lastSyncedDate))
  $('pause-cloud').disabled = data.paused || data.busy
  $('enable-cloud').disabled = !data.paused || data.maintenance || data.busy
  $('reconnect').disabled = data.busy || data.maintenance
  if (data.deployed && firstCloud && !data.busy) { firstCloud = false; updateCloud() }
  if (data.cloud) renderCloud(data.cloud)
}
function renderManual(data) {
  const local = data.manual || {}
  const report = data.deployed ? data.cloud : local
  const until = Math.max(report?.retryAfterUntil || 0, report?.retryNotBefore || 0)
  const waiting = until > Date.now()
  const active = report?.run && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(report.run.status)
  const disabled = data.busy || waiting || data.maintenance || (data.deployed
    ? !data.cloud || data.paused || active : !local.available || !data.netease || !data.spotify)
  for (const id of ['sync-now', 'manual-sync']) {
    $(id).disabled = Boolean(disabled)
    $(id).textContent = data.busy ? '正在处理…' : waiting ? '等待冷却结束' : data.deployed ? '发起云端同步' : local.pending ? '继续上次同步' : '立即同步一次'
  }
  $('manual-help').textContent = data.deployed ? '已由云端接管：手动按钮会提交 GitHub 任务，不在本机使用旧令牌。' : '只需连接网易云与 Spotify，即可同步。此操作会创建或替换专用歌单，本机同步期间请保持 App 运行；每日自动运行需另行配置下方 GitHub。'
  $('manual-status').textContent = waiting ? `需等待至 ${dateText(until)}。${data.deployed ? '定时任务会按规则续跑。' : '进度已保存，到时点击继续同步；本机不会自动重试。'}` : data.deployed ? (active ? '云端任务正在运行，请勿重复提交。' : data.cloud?.lastSyncedDate ? `上次成功：${data.cloud.lastSyncedDate} · ${data.cloud.matchedCount}/${data.cloud.sourceCount} 首。` : '可提交云端同步，完成后查看下方结果。') : local.status === 'running' ? `正在本机同步，已处理 ${local.completedSongs || 0} 首，请勿退出 App。` : local.message || (local.lastSyncedDate ? `上次成功：${local.lastSyncedDate} · ${local.matchedCount}/${local.sourceCount} 首。` : local.pending ? `有未完成的同步进度，已处理 ${local.completedSongs || 0} 首。` : '等待首次手动同步。')
  const url = report?.playlistUrl
  for (const id of ['playlist', 'manual-playlist']) {
    $(id).hidden = !url?.startsWith('https://open.spotify.com/playlist/')
    if (!$(id).hidden) $(id).href = url
  }
}
function renderCloud(cloud) {
  const active = cloud.run && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(cloud.run.status)
  const until = Math.max(cloud.retryAfterUntil || 0, cloud.retryNotBefore || 0)
  const waiting = until > Date.now()
  $('cloud-badge').textContent = current.paused ? '已暂停' : waiting ? '等待恢复' : active ? '同步进行中' : cloud.lastSyncedDate ? '已有成功记录' : '待首次成功'
  $('cloud-title').textContent = waiting ? '同步暂停，进度已保存' : cloud.lastSyncedDate ? '你的每日歌单已启用' : '等待首次同步确认'
  $('cloud-summary').textContent = waiting ? `本次已处理 ${cloud.completedSongs || 0} 首。尚未发布本次歌单，续跑会利用已保存进度。` : cloud.lastSyncedDate ? `上次成功：${cloud.lastSyncedDate} · ${cloud.matchedCount}/${cloud.sourceCount} 首。` : cloud.run?.conclusion === 'failure' ? '首次同步尚未成功。请查看运行记录；若有未完成进度，后续运行会按规则续跑。' : `任务已配置，尚无成功同步记录。已处理 ${cloud.completedSongs || 0} 首。`
  const pauseLabel = cloud.retryAfterUntil > Date.now() ? 'Spotify 要求冷却' : ['request-budget', 'run-budget'].includes(cloud.pauseReason) ? '程序请求预算已用完（不是 Spotify 的 429 冷却），暂停' : '程序因网络／服务异常退避，暂停'
  $('cloud-pause').textContent = waiting ? `${pauseLabel}至 ${dateText(until)}。下一次符合条件的定时运行会续跑，请勿反复点击。` : '通常每天北京时间早上开始；GitHub 可能延迟调度。完成安装后无需保持电脑开机。'
  $('sync-now').disabled = waiting || active || current.paused || current.maintenance || current.busy
  $('playlist').hidden = !cloud.playlistUrl
  if (cloud.playlistUrl?.startsWith('https://open.spotify.com/playlist/')) $('playlist').href = cloud.playlistUrl
  $('run-link').hidden = !cloud.run?.url
  if (cloud.run?.url?.startsWith('https://github.com/')) $('run-link').href = cloud.run.url
  renderManual(current)
}
async function refresh() { if (closed || pollBusy) return; pollBusy = true; try { const data = await api('/api/status'); if (!closed) render(data) } catch (e) { if (!closed) notice(e.message, true) } finally { pollBusy = false } }
async function updateCloud() { if (closed || cloudBusy || !current?.deployed) return; cloudBusy = true; try { const cloud = await api('/api/cloud/status', {}); if (cloud && !closed) { current.cloud = cloud; renderCloud(cloud) } } catch (e) { if (!closed) notice(e.message, true) } finally { cloudBusy = false } }
bind('netease-connect', async () => {
  clearInterval(qrTimer)
  const qr = await api('/api/netease/start', {})
  $('qr').src = qr.image; $('qr-panel').hidden = false; $('qr-message').textContent = '请打开网易云手机 App 扫码'
  let busy = false
  qrTimer = setInterval(async () => {
    if (busy) return; busy = true
    try {
      const result = await api('/api/netease/check', { id: qr.id })
      $('qr-message').textContent = { waiting: '等待扫码…', confirm: '请在手机上确认登录', expired: '二维码已过期，请重新生成', connected: '网易云已连接' }[result.status]
      if (['connected', 'expired'].includes(result.status)) { clearInterval(qrTimer); await refresh() }
    } catch (e) { clearInterval(qrTimer); notice(e.message, true) } finally { busy = false }
  }, 3000)
})
bind('spotify-connect', async () => { const result = await api('/api/spotify/connect', { clientId: $('client-id').value.trim() }); window.location.assign(result.url) })
bind('github-connect', async () => { await api('/api/github/connect', { consent: $('github-consent').checked }) })
bind('copy-redirect', async () => { await navigator.clipboard.writeText($('redirect').textContent); notice('回调地址已复制，粘贴到 Spotify 的 Redirect URI。') })
bind('copy-code', async () => { await navigator.clipboard.writeText($('github-code').textContent); notice('验证码已复制。') })
bind('deploy', async () => { await api('/api/deploy', { consent: $('deploy-consent').checked, visibility: $('visibility').value }); notice('正在准备你的独立云端配置，请不要退出安装助手。') })
$('deploy-consent').addEventListener('change', () => current && render(current))
$('github-consent').addEventListener('change', () => current && render(current))
bind('refresh', updateCloud)
async function triggerSync() {
  if (!current?.deployed && !confirm('现在同步网易云每日推荐到 Spotify？这会创建或替换专用歌单的内容。同步期间请保持 App 运行。')) return
  const result = await api('/api/sync', { consent: true })
  notice(result.paused ? `仍需等待至 ${dateText(result.until)}` : result.running ? '已有任务运行中，无需重复提交。' : result.mode === 'local' ? '已开始本机同步，无需 GitHub。下方会显示进度与结果。' : '已提交云端同步，稍后刷新查看结果。')
  if (current?.deployed) await updateCloud()
}
bind('sync-now', triggerSync)
bind('manual-sync', triggerSync)
bind('reconnect', async () => { if (confirm('这会先暂停云端定时，避免令牌冲突。重新登录后需要点击“保存新授权并恢复自动同步”。继续吗？')) await api('/api/cloud/reconnect', {}) })
bind('pause-cloud', async () => { if (confirm('停止后续每日自动同步？正在运行的任务不会被强行取消。')) { await api('/api/cloud/pause', { consent: true }); notice('已暂停后续自动同步。') } })
bind('enable-cloud', async () => { await api('/api/cloud/enable', {}); notice('已恢复每日自动同步。') })
$('exit').addEventListener('click', async () => { try { await api('/api/exit', {}); closed = true; clearInterval(qrTimer); timers.forEach(clearInterval); document.body.textContent = '安装助手已退出。你可以关闭这个窗口；已启用的云端同步会继续运行。' } catch (e) { notice(e.message, true) } })
const result = new URLSearchParams(location.search).get('spotify')
if (result) { notice(result === 'connected' ? 'Spotify 已连接。' : 'Spotify 授权未完成，请检查回调地址、Premium 和应用允许用户后重试。', result !== 'connected'); history.replaceState(null, '', '/') }
await refresh()
timers.push(setInterval(refresh, 2500))
timers.push(setInterval(() => { if (current?.deployed && !current.busy && !current.paused) updateCloud() }, 30000))
