import { mkdir, readFile, writeFile, chmod, unlink, open } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const directory = process.env.DAILY_RELAY_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Daily Relay')
const port = Number(process.env.DAILY_RELAY_INSTALLER_PORT || 18787)
const origin = `http://127.0.0.1:${port}`
const infoPath = path.join(directory, 'launcher.json')
await mkdir(directory, { recursive: true, mode: 0o700 })
await chmod(directory, 0o700)
process.env.DAILY_RELAY_DATA_DIR = directory
process.env.HOST = '127.0.0.1'
process.env.PORT = String(port)
process.env.APP_ORIGIN = origin

async function browse(url) {
  if (process.env.DAILY_RELAY_NO_BROWSER === '1') return
  const child = spawn('/usr/bin/open', [url], { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

if (process.argv.includes('--serve')) {
  const { createInstallerServer } = await import('../src/installer-server.js')
  const session = process.env.DAILY_RELAY_SESSION || randomBytes(32).toString('hex')
  const app = await createInstallerServer({ directory, origin, session, onExit: () => setTimeout(() => process.exit(0), 100) })
  app.server.on('error', () => { console.error('安装助手端口被占用，请关闭其他实例后重试。'); process.exitCode = 1 })
  app.server.listen(port, '127.0.0.1', async () => {
    await writeFile(infoPath, JSON.stringify({ pid: process.pid, origin, session }), { mode: 0o600 })
    await chmod(infoPath, 0o600)
    console.log(`Daily Relay installer ready on port ${port}`)
  })
} else {
  const lockPath = path.join(directory, 'launch.lock')
  let lock
  for (let attempt = 0; attempt < 50; attempt++) {
    try { lock = await open(lockPath, 'wx', 0o600); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  if (!lock) throw new Error('另一个安装助手正在启动。若曾意外退出，请在配置目录删除 launch.lock 后重新打开。')
  try {
    let saved
    try { saved = JSON.parse(await readFile(infoPath, 'utf8')) } catch {}
    if (saved?.origin === origin) {
      const health = await fetch(`${origin}/health`, { headers: { cookie: `relay_session=${saved.session}` }, signal: AbortSignal.timeout(1000) }).then(r => r.json()).catch(() => null)
      if (health?.app === 'daily-relay-installer' && health.authenticated) { await browse(`${origin}/launch?key=${saved.session}`); process.exitCode = 0 }
      else saved = null
    } else saved = null
    if (!saved) {
      // Never attach to an unrelated process listening on the callback port.
      const occupied = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(800) }).then(() => true).catch(() => false)
      if (occupied) throw new Error('18787 端口已被其他程序占用，请关闭冲突程序后重试。')
      const session = randomBytes(32).toString('hex')
      const log = await open(path.join(directory, 'installer.log'), 'a', 0o600)
      const child = spawn(process.execPath, [path.join(root, 'scripts', 'installer-launcher.js'), '--serve'], {
        cwd: root, env: { ...process.env, DAILY_RELAY_SESSION: session }, stdio: ['ignore', log.fd, log.fd], detached: true,
      })
      child.unref(); await log.close()
      let ready = false
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200))
        const health = await fetch(`${origin}/health`, { headers: { cookie: `relay_session=${session}` }, signal: AbortSignal.timeout(500) }).then(r => r.json()).catch(() => null)
        if (health?.authenticated) { ready = true; break }
      }
      if (!ready) throw new Error('安装助手未能启动，请查看配置目录里的 installer.log。')
      await browse(`${origin}/launch?key=${session}`)
    }
  } finally { await lock.close(); await unlink(lockPath) }
}
