const $ = id => document.getElementById(id)
let current; let qrTimer; let pollBusy = false; let cloudBusy = false; let firstCloud = true
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
  const ready = data.netease && data.spotify && data.github.status === 'connected'
  $('deploy').disabled = !ready || data.busy || (data.deployed && !data.maintenance) || !$('deploy-consent').checked
  $('deploy').textContent = data.maintenance ? '保存新授权并恢复自动同步' : data.deployed ? '云端已配置' : data.busy ? '正在自动配置…' : '开启我的每日同步'
  $('deploy-status').textContent = data.deployment.message || ''
  if (data.deployment.status === 'error') notice(data.deployment.message, true)
  $('cloud-panel').hidden = !data.deployed
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
function renderCloud(cloud) {
  const active = cloud.run && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(cloud.run.status)
  const until = Math.max(cloud.retryAfterUntil || 0, cloud.retryNotBefore || 0)
  const waiting = until > Date.now()
  $('cloud-badge').textContent = current.paused ? '已暂停' : waiting ? '等待恢复' : active ? '同步进行中' : cloud.lastSyncedDate ? '已有成功记录' : '待首次成功'
  $('cloud-title').textContent = cloud.lastSyncedDate ? '你的每日歌单已启用' : '等待首次同步确认'
  $('cloud-summary').textContent = cloud.lastSyncedDate ? `上次成功：${cloud.lastSyncedDate} · ${cloud.matchedCount}/${cloud.sourceCount} 首。` : cloud.run?.conclusion === 'failure' ? '首次同步尚未成功。系统保留进度并按规则重试；如授权失效，请重新连接账号。' : `任务已配置，尚无成功同步记录。已处理 ${cloud.completedSongs || 0} 首。`
  $('cloud-pause').textContent = waiting ? `${cloud.retryAfterUntil > Date.now() ? 'Spotify 要求等待' : '本地安全预算／退避暂停'}至 ${dateText(until)}。下一次符合条件的定时运行会续跑，请勿反复点击。` : '通常每天北京时间早上开始；GitHub 可能延迟调度。完成安装后无需保持电脑开机。'
  $('sync-now').disabled = waiting || active || current.paused || current.maintenance || current.busy
  $('playlist').hidden = !cloud.playlistUrl
  if (cloud.playlistUrl?.startsWith('https://open.spotify.com/playlist/')) $('playlist').href = cloud.playlistUrl
  $('run-link').hidden = !cloud.run?.url
  if (cloud.run?.url?.startsWith('https://github.com/')) $('run-link').href = cloud.run.url
}
async function refresh() { if (pollBusy) return; pollBusy = true; try { render(await api('/api/status')) } catch (e) { notice(e.message, true) } finally { pollBusy = false } }
async function updateCloud() { if (cloudBusy || !current?.deployed) return; cloudBusy = true; try { const cloud = await api('/api/cloud/status', {}); if (cloud) { current.cloud = cloud; renderCloud(cloud) } } catch (e) { notice(e.message, true) } finally { cloudBusy = false } }
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
bind('refresh', updateCloud)
bind('sync-now', async () => { const result = await api('/api/cloud/run', {}); notice(result.paused ? `仍需等待至 ${dateText(result.until)}` : result.running ? '已有任务运行中，无需重复提交。' : '已提交同步，稍后刷新查看结果。'); await updateCloud() })
bind('reconnect', async () => { if (confirm('这会先暂停云端定时，避免令牌冲突。重新登录后需要点击“保存新授权并恢复自动同步”。继续吗？')) await api('/api/cloud/reconnect', {}) })
bind('pause-cloud', async () => { if (confirm('停止后续每日自动同步？正在运行的任务不会被强行取消。')) { await api('/api/cloud/pause', { consent: true }); notice('已暂停后续自动同步。') } })
bind('enable-cloud', async () => { await api('/api/cloud/enable', {}); notice('已恢复每日自动同步。') })
$('exit').addEventListener('click', async () => { try { await api('/api/exit', {}); document.body.textContent = '安装助手已退出。你可以关闭这个窗口；已启用的云端同步会继续运行。' } catch (e) { notice(e.message, true) } })
const result = new URLSearchParams(location.search).get('spotify')
if (result) { notice(result === 'connected' ? 'Spotify 已连接。' : 'Spotify 授权未完成，请检查回调地址、Premium 和应用允许用户后重试。', result !== 'connected'); history.replaceState(null, '', '/') }
await refresh()
setInterval(refresh, 2500)
setInterval(() => { if (current?.deployed && !current.busy && !current.paused) updateCloud() }, 30000)
