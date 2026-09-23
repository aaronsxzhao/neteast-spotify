import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

// Explicit trust boundary: only runtime modules and cloud tests enter a friend's
// repository. Dependency closure checks fail closed when new modules are added.
const runtime = ['cloud-state.js', 'cloud-policy.js', 'cloud-run.js', 'cloud-audit.js', 'config.js',
  'matcher.js', 'match-cache.js', 'netease.js', 'request-safety.js', 'spotify.js', 'sync.js']

export function validatePayload(entries) {
  const names = new Set(entries.map(e => e.path))
  for (const entry of entries) {
    if (!entry.path.endsWith('.js')) continue
    for (const match of entry.content.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), match[1]))
      if (!names.has(target)) throw new Error(`Incomplete cloud payload: ${entry.path} requires ${target}`)
    }
  }
}

export async function buildInfo(root) {
  try { return JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, sourceCommit: null }
  }
}

export async function cloudEntries(root) {
  const tests = (await readdir(path.join(root, 'test'))).filter(name => name.endsWith('.test.js') && !name.startsWith('installer'))
  const files = ['package.json', 'pnpm-lock.yaml', '.github/workflows/daily-sync.yml',
    ...runtime.map(name => `src/${name}`), ...tests.map(name => `test/${name}`)]
  const entries = await Promise.all(files.sort().map(async name => ({ path: name, mode: '100644', type: 'blob',
    content: await readFile(path.join(root, name), 'utf8') })))
  validatePayload(entries)
  const digest = createHash('sha256').update(JSON.stringify(entries)).digest('hex')
  entries.push({ path: 'daily-relay-build.json', mode: '100644', type: 'blob',
    content: JSON.stringify({ ...await buildInfo(root), payloadSha256: digest }, null, 2) + '\n' })
  return entries
}
