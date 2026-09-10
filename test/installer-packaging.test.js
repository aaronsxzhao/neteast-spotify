import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, symlink, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { copyPortableDependencies } from '../scripts/portable-dependencies.js'
import { installerMessage } from '../src/installer-github.js'

test('packaging preserves pnpm transitive resolution after source dependencies are moved away', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'relay-package-test-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const source = path.join(temp, 'source', 'node_modules')
  const bundle = path.join(temp, 'bundle', 'node_modules')
  const virtual = path.join(source, '.pnpm', 'example@1', 'node_modules')
  await mkdir(path.join(virtual, 'example'), { recursive: true })
  await mkdir(path.join(virtual, 'dependency'), { recursive: true })
  await writeFile(path.join(virtual, 'example', 'index.js'), "module.exports = require('dependency')")
  await writeFile(path.join(virtual, 'dependency', 'index.js'), "module.exports = 'dependency-loaded'")
  await symlink('.pnpm/example@1/node_modules/example', path.join(source, 'example'))
  await copyPortableDependencies(source, bundle)
  await rename(source, path.join(temp, 'source-hidden'))
  const require = createRequire(path.join(temp, 'bundle', 'package.json'))
  assert.equal(require('example'), 'dependency-loaded')
})

test('packaging rejects external dependency links and reports missing modules without exposing paths', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'relay-package-test-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const source = path.join(temp, 'source'); await mkdir(source)
  await writeFile(path.join(temp, 'outside.js'), 'module.exports = 1')
  await symlink('../outside.js', path.join(source, 'escape'))
  await assert.rejects(copyPortableDependencies(source, path.join(temp, 'bundle')), /escapes bundle/)
  const message = installerMessage(Object.assign(new Error('private-path or secret'), { code: 'MODULE_NOT_FOUND' }))
  assert.match(message, /安装包缺少运行依赖/)
  assert.ok(!message.includes('private-path'))
})
