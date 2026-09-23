import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { cloudEntries } from '../src/installer-payload.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const directory = await mkdtemp(path.join(os.tmpdir(), 'relay-cloud-payload-'))
try {
  for (const entry of await cloudEntries(root)) {
    const file = path.join(directory, entry.path)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, entry.content)
  }
  // Dependency versions are exactly those installed from our frozen lockfile;
  // source files are isolated so a missing module cannot resolve from the repo.
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'))
  const result = spawnSync(process.execPath, ['--test'], { cwd: directory, stdio: 'inherit',
    env: { PATH: process.env.PATH, NODE_OPTIONS: '', NODE_PATH: '' } })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Cloud payload tests failed; do not release this installer')
} finally { await rm(directory, { recursive: true, force: true }) }
