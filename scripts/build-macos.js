import { cp, mkdir, readFile, writeFile, chmod, readdir, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('Build this bundle on macOS for the target architecture.')
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const arch = process.arch
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'dist', `Daily-Relay-macOS-${arch}-${stamp}`)
const app = path.join(output, 'Daily Relay.app')
const resources = path.join(app, 'Contents', 'Resources')
const tools = JSON.parse(await readFile(path.join(root, '.build-tools', 'tools.json'), 'utf8'))
await mkdir(path.join(app, 'Contents', 'MacOS'), { recursive: true })
await mkdir(path.join(resources, 'runtime'), { recursive: true })
// Explicit allowlist: never copy the working directory, .git, .data or user state.
for (const entry of ['src', 'test', 'installer', 'scripts', '.github', 'package.json', 'pnpm-lock.yaml', 'docs', 'README.md']) {
  await cp(path.join(root, entry), path.join(resources, entry), { recursive: true, filter: source => !source.includes('citypop-cover-prompt') })
}
await cp(path.join(root, 'node_modules'), path.join(resources, 'node_modules'), { recursive: true, dereference: true })
// Share the existing UI, copying only the served frontend assets (no design sources).
await mkdir(path.join(resources, 'public', 'assets'), { recursive: true })
for (const entry of ['index.html', 'app.js', 'styles.css', 'assets/daily-relay-cover-citypop-no-text.jpg']) {
  await cp(path.join(root, 'public', entry), path.join(resources, 'public', entry))
}
await cp(process.execPath, path.join(resources, 'runtime', 'node'))
await chmod(path.join(resources, 'runtime', 'node'), 0o755)
const gh = process.env.DAILY_RELAY_BUILD_GH || tools.gh
if (!gh) throw new Error('Set DAILY_RELAY_BUILD_GH to the verified official gh binary for this architecture.')
await mkdir(path.join(resources, 'vendor'))
await cp(gh, path.join(resources, 'vendor', 'gh'))
await chmod(path.join(resources, 'vendor', 'gh'), 0o755)
await cp(path.join(root, 'packaging', 'NOTICE.txt'), path.join(resources, 'NOTICE.txt'))
await cp(path.join(root, 'packaging', '开始使用.txt'), path.join(output, '开始使用.txt'))
// Include the full redistribution licenses, not only a link to upstream.
for (const [name, filename] of [['GitHub-CLI-LICENSE.txt', process.env.DAILY_RELAY_GH_LICENSE || tools.ghLicense], ['Node-LICENSE.txt', process.env.DAILY_RELAY_NODE_LICENSE || tools.nodeLicense]]) {
  if (!filename) throw new Error(`Missing ${name} for redistribution`)
  await cp(filename, path.join(resources, name))
}
const launcher = '#!/bin/sh\nAPP_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)"\nexec "$APP_ROOT/runtime/node" "$APP_ROOT/scripts/installer-launcher.js"\n'
await writeFile(path.join(app, 'Contents', 'MacOS', 'DailyRelay'), launcher, { mode: 0o755 })
await chmod(path.join(app, 'Contents', 'MacOS', 'DailyRelay'), 0o755)
await writeFile(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Daily Relay</string><key>CFBundleDisplayName</key><string>Daily Relay</string><key>CFBundleIdentifier</key><string>local.dailyrelay.installer</string><key>CFBundleExecutable</key><string>DailyRelay</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>`)
const forbidden = new Set(['.data', '.git', 'state.json', 'state.enc', 'hosts.yml', 'launcher.json', 'DAILY_RELAY_CONFIG.txt', 'DAILY_RELAY_STATE_KEY.txt'])
async function audit(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (forbidden.has(item.name)) throw new Error(`Private state found in bundle: ${item.name}`)
    if (item.isDirectory()) await audit(path.join(dir, item.name))
  }
}
await audit(app)
// Ad-hoc signing ensures bundle integrity locally; this is NOT Apple notarization.
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'pipe' })
const zip = `${output}.zip`
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', output, zip])
console.log(JSON.stringify({ app, zip, bytes: (await stat(zip)).size, architecture: arch, notarized: false }))
