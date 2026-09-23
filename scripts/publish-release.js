import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const repository = 'aaronsxzhao/neteast-spotify'
if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Release publishing is limited to the maintainer main branch')
const release = JSON.parse(await readFile('dist/release.json', 'utf8'))
if (release.sourceCommit !== process.env.GITHUB_SHA || release.architecture !== 'arm64' || !/^\d+\.\d+\.\d+-build\.\d+\.\d+$/.test(release.version)) throw new Error('Release provenance mismatch')
const bytes = await readFile(release.zip)
if (createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('Installer checksum mismatch')
const tools = JSON.parse(await readFile('.build-tools/tools.json', 'utf8'))
const gh = args => execFileSync(tools.gh, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const head = gh(['api', `repos/${repository}/git/ref/heads/main`, '--jq', '.object.sha'])
if (head !== release.sourceCommit) {
  console.log('A newer main commit exists; its build will publish. Skipping obsolete release.')
} else {
  const tag = `v${release.version}`
  const notes = `## macOS 自助安装包（内测）\n\n源代码提交：${release.sourceCommit}\n\n下载 ZIP（不要下载 Source code），解压打开 Daily Relay.app。仅支持 Apple Silicon、macOS 13+；未经过 Apple 公证。\n\n新用户：扫码连接网易云 → 按指引创建自己的 Spotify 应用并授权 → GitHub 授权 → 开启每日同步。\n\n老用户：先在旧助手中点「退出安装助手」，打开新版，再点「用此安装包更新云端程序」。保留账号、歌单、封面与冷却状态，不自动发起同步。请勿删除本机配置目录。\n\n通过：完整回归测试、隔离云端部署测试、包内依赖和空白账号启动检查。模拟测试不替代每位用户的真实授权验收。\n\nSHA-256：\`${release.sha256}\`\n\n[安装说明](https://github.com/${repository}/blob/${release.sourceCommit}/docs/friend-installer.md)\n`
  const notesPath = path.resolve('dist/release-notes.md')
  await writeFile(notesPath, notes)
  // Assets are present before the draft is made public. Never modify an old
  // release's files; reruns get a separate build-attempt version.
  gh(['release', 'create', tag, release.zip, release.checksum, '--repo', repository, '--target', release.sourceCommit,
    '--title', `Daily Relay ${release.version} · macOS 自助安装版`, '--notes-file', notesPath, '--draft', '--prerelease'])
  gh(['release', 'edit', tag, '--repo', repository, '--draft=false'])
  console.log(`Published https://github.com/${repository}/releases/tag/${tag}`)
}
