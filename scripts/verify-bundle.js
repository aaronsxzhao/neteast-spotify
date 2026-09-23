import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'

const root = path.resolve(process.argv[2])
const { createInstallerServer } = await import(path.join(root, 'src/installer-server.js'))
const directory = await mkdtemp(path.join(os.tmpdir(), 'relay-bundle-smoke-'))
let app
try {
  const origin = 'http://127.0.0.1:18787'
  app = await createInstallerServer({ directory, origin, session: 'offline-bundle-smoke' })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const address = `http://127.0.0.1:${app.server.address().port}`
  const headers = { host: '127.0.0.1:18787', cookie: 'relay_session=offline-bundle-smoke' }
  const status = await fetch(address + '/api/status', { headers }).then(r => r.json())
  assert.equal(status.netease, false); assert.equal(status.spotify, false); assert.equal(status.deployed, false)
  assert.equal(status.github.status, 'idle')
  assert.equal(status.build.sourceCommit, JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8')).sourceCommit)
  for (const route of ['/', '/app.js', '/setup.js', '/setup-panels.html']) {
    assert.equal((await fetch(address + route, { headers })).status, 200, route)
  }
  console.log('Packaged first-run smoke check passed: blank accounts, UI and build metadata')
} finally {
  if (app) await new Promise(resolve => app.server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
