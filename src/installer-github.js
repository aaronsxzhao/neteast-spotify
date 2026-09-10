import { spawn } from 'node:child_process'
import { mkdir, chmod, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { CloudStore, encryptState, decryptState, parseConfig } from './cloud-state.js'

export class InstallerError extends Error {}
export function installerMessage(error) {
  if (error instanceof InstallerError) return error.message
  if (error?.status === 429 || error?.pauseReason) return '当前存在冷却或请求预算暂停，请等待后重试。已保存的进度不会丢失。'
  return `操作未完成${Number.isInteger(error?.status) ? `（HTTP ${error.status}）` : ''}，请检查网络或重新授权。`
}

export function isolatedGhEnv(directory) {
  const env = { ...process.env, GH_CONFIG_DIR: directory, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1',
    GH_BROWSER: process.platform === 'win32' ? 'cmd /c exit 0' : '/usr/bin/true', NO_COLOR: '1', LC_ALL: 'C' }
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_DEBUG']) delete env[key]
  return env
}

export class GitHubInstaller {
  constructor(store, root, { binary = process.env.DAILY_RELAY_GH_PATH || path.join(root, 'vendor', process.platform === 'win32' ? 'gh.exe' : 'gh'), run } = {}) {
    this.store = store
    this.root = root
    this.binary = binary
    this.directory = path.join(store.directory, 'github-auth')
    this.env = isolatedGhEnv(this.directory)
    this.execute = run || this.command.bind(this)
    this.login = { status: 'idle' }
    this.progress = { status: 'idle', message: '' }
  }

  async command(args, input = '') {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    // GH_CONFIG_DIR alone is insufficient if the host supplies another auth
    // mechanism. Require a credential explicitly created by THIS wizard.
    let credentials = ''
    try { credentials = await readFile(path.join(this.directory, 'hosts.yml'), 'utf8') } catch {}
    if (!/^github\.com:/m.test(credentials) || !/^\s+oauth_token:\s+\S+/m.test(credentials)) {
      throw new InstallerError('请先在本安装助手中连接你的 GitHub 账号。不会借用电脑上其他程序的登录。')
    }
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, { env: this.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      let stdout = ''; let stderr = ''
      const timer = setTimeout(() => child.kill(), 60_000)
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 8_000_000) child.kill() })
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
      child.on('error', () => { clearTimeout(timer); reject(new InstallerError('内置 GitHub 助手无法启动，请重新下载完整安装包。')) })
      child.on('close', code => {
        clearTimeout(timer)
        if (code === 0) resolve(stdout)
        else {
          const status = Number(stderr.match(/HTTP (\d{3})/)?.[1]) || undefined
          if (status === 401) this.login = { status: 'error', message: 'GitHub 授权已失效，请重新连接。' }
          reject(Object.assign(new InstallerError(status === 401 ? 'GitHub 授权已失效，请重新连接。' : status === 403 ? 'GitHub 权限不足或额度受限，请重新授权并检查账号状态。' : `GitHub 操作未完成${status ? `（HTTP ${status}）` : ''}，可以稍后重试。`), { status }))
        }
      })
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    })
  }

  async api(endpoint, method = 'GET', data) {
    const args = ['api', '--hostname', 'github.com', '--method', method, endpoint]
    if (data !== undefined) args.push('--input', '-')
    const result = await this.execute(args, data === undefined ? '' : JSON.stringify(data))
    return result.trim() ? JSON.parse(result) : null
  }

  async profile() {
    const user = await this.api('user')
    if (!/^[a-zA-Z0-9-]+$/.test(user.login)) throw new InstallerError('GitHub 用户名无效。')
    if (this.store.state.installer?.owner && user.login !== this.store.state.installer.owner) throw new InstallerError('当前 GitHub 账号与已配置仓库不一致，请使用原账号。')
    this.login = { status: 'connected', login: user.login }
    return user.login
  }

  async startLogin() {
    if (this.loginChild) return this.login
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    // Isolated CLI config: never borrow the machine's existing gh login or tokens.
    const child = spawn(this.binary, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'repo,workflow', '--insecure-storage'],
      { env: this.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.loginChild = child
    this.login = { status: 'starting' }
    let output = ''
    const parse = chunk => {
      output = (output + chunk).slice(-8000)
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0]
      if (code) this.login = { status: 'waiting', code, url: 'https://github.com/login/device' }
    }
    child.stdout.on('data', parse)
    child.stderr.on('data', parse)
    child.stdin.on('error', () => {})
    child.stdin.end('\n')
    const timer = setTimeout(() => child.kill(), 15 * 60_000)
    child.on('error', () => { this.login = { status: 'error', message: '找不到内置 GitHub 助手，请使用完整安装包。' } })
    child.on('close', async code => {
      clearTimeout(timer)
      this.loginChild = null
      if (code !== 0) { this.login = { status: 'error', message: '授权未完成或已过期，请重新连接。' }; return }
      try {
        await chmod(path.join(this.directory, 'hosts.yml'), 0o600)
        await this.profile()
      } catch { this.login = { status: 'error', message: '未能验证 GitHub 授权，请重试。' } }
    })
    return this.login
  }

  async sourceEntries() {
    const sources = ['cloud-state.js', 'cloud-policy.js', 'cloud-run.js', 'config.js', 'matcher.js', 'netease.js', 'request-safety.js', 'spotify.js', 'sync.js']
    const tests = (await readdir(path.join(this.root, 'test'))).filter(name => name.endsWith('.test.js') && !name.startsWith('installer'))
    const files = ['package.json', 'pnpm-lock.yaml', '.github/workflows/daily-sync.yml', ...sources.map(name => `src/${name}`), ...tests.map(name => `test/${name}`)]
    return Promise.all(files.map(async name => ({ path: name, mode: '100644', type: 'blob', content: await readFile(path.join(this.root, name), 'utf8') })))
  }

  async deployment({ consent, visibility = 'private' }, spotify) {
    if (!consent) throw new InstallerError('请先确认云端部署授权。')
    if (!['private', 'public'].includes(visibility)) throw new InstallerError('仓库可见性无效。')
    const owner = await this.profile()
    const { settings } = this.store.state
    if (!settings.neteaseCookie || !this.store.state.spotify.refreshToken || !settings.spotifyClientId) throw new InstallerError('请先连接两个音乐账号。')
    if (this.store.state.installer?.deployed) throw new InstallerError('已经部署，请使用“立即同步”，不要重复创建。')
    const step = message => { this.progress = { status: 'running', message } }
    step('检查音乐账号并准备你的专属歌单')
    if (!this.store.state.sync.playlistId) {
      const playlist = await spotify.createPlaylist(settings.playlistName, false)
      await this.store.update(state => { state.sync.playlistId = playlist.id; state.sync.playlistUrl = playlist.external_urls?.spotify })
    }
    if (!this.store.state.installer) await this.store.update(state => {
      const installationId = randomBytes(8).toString('hex')
      state.installer = { owner, installationId, repository: `${owner}/daily-relay-${installationId.slice(0, 6)}`, stateKey: randomBytes(32).toString('hex'), visibility }
      state.settings.scheduleEnabled = false
    })
    const installation = this.store.state.installer
    if (installation.owner !== owner || !installation.repository.startsWith(`${owner}/daily-relay-`)) throw new InstallerError('仓库归属验证失败。')
    const repo = installation.repository
    step('在你的 GitHub 账号下准备独立仓库')
    let existing
    try { existing = await this.api(`repos/${repo}`) } catch (error) { if (error.status !== 404) throw error }
    if (existing && (existing.owner?.login !== owner || existing.description !== `Daily Relay installation ${installation.installationId}`)) throw new InstallerError('同名仓库不是本助手创建的，已停止，未覆盖任何文件。')
    if (!existing) await this.api('user/repos', 'POST', { name: repo.split('/')[1], private: installation.visibility !== 'public', description: `Daily Relay installation ${installation.installationId}`, auto_init: true })
    await this.api(`repos/${repo}/actions/permissions`, 'PUT', { enabled: false })
    // No schedules can run until config + encrypted initial state are both ready.
    step('加密保存凭证，仅写入你自己的 GitHub Secrets')
    const config = parseConfig(JSON.stringify({ spotifyClientId: settings.spotifyClientId, spotifyRefreshToken: this.store.state.spotify.refreshToken,
      spotifyScope: this.store.state.spotify.scope, neteaseCookie: settings.neteaseCookie, playlistId: this.store.state.sync.playlistId,
      playlistName: settings.playlistName, playlistPublic: false, timezone: settings.timezone }))
    await this.execute(['secret', 'set', 'DAILY_RELAY_CONFIG', '--repo', repo], JSON.stringify(config))
    await this.execute(['secret', 'set', 'DAILY_RELAY_STATE_KEY', '--repo', repo], installation.stateKey)
    step('安装每日定时任务和冷却后续跑逻辑')
    const tree = await this.api(`repos/${repo}/git/trees`, 'POST', { tree: await this.sourceEntries() })
    const commit = await this.api(`repos/${repo}/git/commits`, 'POST', { message: 'Install personal Daily Relay', tree: tree.sha, parents: [] })
    await this.setInitialRef(repo, 'main', commit.sha)
    await this.api(`repos/${repo}`, 'PATCH', { default_branch: 'main' })
    const cloud = new CloudStore(config, installation.stateKey, {})
    Object.assign(cloud.state.spotify, { requestTimes: this.store.state.spotify.requestTimes, retryAfterUntil: this.store.state.spotify.retryAfterUntil,
      retryNotBefore: this.store.state.spotify.retryNotBefore, pauseReason: this.store.state.spotify.pauseReason })
    const stateTree = await this.api(`repos/${repo}/git/trees`, 'POST', { tree: [{ path: 'state.enc', mode: '100644', type: 'blob', content: encryptState(cloud.snapshot(), installation.stateKey) }] })
    const stateCommit = await this.api(`repos/${repo}/git/commits`, 'POST', { message: 'Initialize encrypted personal state', tree: stateTree.sha, parents: [commit.sha] })
    await this.setInitialRef(repo, 'daily-relay-state', stateCommit.sha)
    await this.api(`repos/${repo}/actions/permissions`, 'PUT', { enabled: true })
    await this.store.update(state => { state.installer.deployed = true; state.settings.scheduleEnabled = false })
    step('部署完成，正在提交首次同步')
    for (let attempt = 0; ; attempt++) {
      try { await this.dispatch(); break } catch (error) {
        if (error.status !== 404 || attempt >= 3) throw error
        // GitHub may need a moment to index a newly created workflow. This
        // retries only a confirmed 404, never an ambiguous dispatch response.
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }
    this.progress = { status: 'done', message: '已部署；首次同步结果正在核验。只有日期和曲目数量更新才算同步成功。' }
    return { repository: repo }
  }

  async setInitialRef(repo, branch, sha) {
    let ref
    try { ref = await this.api(`repos/${repo}/git/ref/heads/${branch}`) } catch (error) { if (![404, 409].includes(error.status)) throw error }
    // Only retry an interrupted installer-owned repository while Actions are disabled.
    if (ref) await this.api(`repos/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha, force: true })
    else await this.api(`repos/${repo}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha })
  }

  async cloudStatus() {
    const installation = this.store.state.installer
    if (!installation?.deployed) return null
    await this.profile()
    const repo = installation.repository
    const file = await this.api(`repos/${repo}/contents/state.enc?ref=daily-relay-state`)
    const state = decryptState(Buffer.from(file.content, 'base64').toString('utf8'), installation.stateKey)
    const runs = await this.api(`repos/${repo}/actions/workflows/daily-sync.yml/runs?per_page=1`)
    const latest = runs.workflow_runs?.[0]
    const last = state.sync?.lastSuccessfulRun
    return { repository: repo, playlistUrl: state.sync?.playlistUrl, lastSyncedDate: state.sync?.lastSyncedDate,
      matchedCount: last?.matchedCount, sourceCount: last?.sourceCount, completedSongs: state.sync?.checkpoint?.completed || 0,
      retryAfterUntil: state.spotify?.retryAfterUntil, retryNotBefore: state.spotify?.retryNotBefore, pauseReason: state.spotify?.pauseReason,
      run: latest ? { id: latest.id, status: latest.status, conclusion: latest.conclusion, url: latest.html_url } : null }
  }

  async beginRenew() {
    await this.profile()
    const installation = this.store.state.installer
    if (!installation?.deployed) throw new InstallerError('请先完成部署。')
    await this.api(`repos/${installation.repository}/actions/workflows/daily-sync.yml/disable`, 'PUT')
    await this.store.update(state => { state.installer.paused = true })
    const status = await this.cloudStatus()
    if (status.run && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(status.run.status)) throw new InstallerError('定时已暂停，但当前云端任务仍在运行。请等它结束后再点“重新连接账号”。')
    const file = await this.api(`repos/${installation.repository}/contents/state.enc?ref=daily-relay-state`)
    const saved = decryptState(Buffer.from(file.content, 'base64').toString('utf8'), installation.stateKey)
    await this.store.update(state => {
      state.spotify = { ...saved.spotify, profile: state.spotify.profile }
      state.sync = { ...state.sync, ...saved.sync }
      state.installer.maintenance = true
    })
  }

  async finishRenew(spotify) {
    await this.profile()
    const installation = this.store.state.installer
    if (!installation?.maintenance) throw new InstallerError('请先暂停云端并进入重新连接。')
    if (!this.store.state.sync.playlistId) {
      const playlist = await spotify.createPlaylist(this.store.state.settings.playlistName, false)
      await this.store.update(state => { state.sync.playlistId = playlist.id; state.sync.playlistUrl = playlist.external_urls?.spotify })
    }
    const { settings, sync, spotify: auth } = this.store.state
    const config = parseConfig(JSON.stringify({ spotifyClientId: settings.spotifyClientId, spotifyRefreshToken: auth.refreshToken, spotifyScope: auth.scope,
      neteaseCookie: settings.neteaseCookie, playlistId: sync.playlistId, playlistName: settings.playlistName, playlistPublic: false, timezone: settings.timezone }))
    const repo = installation.repository
    const file = await this.api(`repos/${repo}/contents/state.enc?ref=daily-relay-state`)
    const cloud = new CloudStore(config, installation.stateKey, {})
    Object.assign(cloud.state.spotify, { requestTimes: auth.requestTimes, retryAfterUntil: auth.retryAfterUntil, retryNotBefore: auth.retryNotBefore,
      pauseReason: auth.pauseReason, transientFailures: auth.transientFailures })
    await this.execute(['secret', 'set', 'DAILY_RELAY_CONFIG', '--repo', repo], JSON.stringify(config))
    await this.api(`repos/${repo}/contents/state.enc`, 'PUT', { branch: 'daily-relay-state', sha: file.sha, message: 'Update encrypted personal authorization',
      content: Buffer.from(encryptState(cloud.snapshot(), installation.stateKey)).toString('base64') })
    await this.api(`repos/${repo}/actions/workflows/daily-sync.yml/enable`, 'PUT')
    await this.store.update(state => { state.installer.maintenance = false; state.installer.paused = false })
    await this.dispatch()
    this.progress = { status: 'done', message: '授权已更新，自动同步已恢复。' }
  }

  async dispatch() {
    if (this.store.state.installer?.maintenance || this.store.state.installer?.paused) throw new InstallerError('自动同步已暂停，请先保存更新的授权或恢复自动同步。')
    const status = await this.cloudStatus()
    if (!status) throw new InstallerError('尚未完成云端部署。')
    const until = Math.max(status.retryAfterUntil || 0, status.retryNotBefore || 0)
    if (until > Date.now()) return { paused: true, until }
    if (status.run && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(status.run.status)) return { running: true }
    await this.api(`repos/${status.repository}/actions/workflows/daily-sync.yml/dispatches`, 'POST', { ref: 'main', inputs: { force: 'false' } })
    return { submitted: true }
  }
}
