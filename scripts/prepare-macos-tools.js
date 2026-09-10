import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const version = '2.100.0'
const directory = path.resolve('.build-tools')
const architecture = process.arch === 'arm64' ? 'arm64' : 'amd64'
const filename = `gh_${version}_macOS_${architecture}.zip`
await mkdir(directory, { recursive: true })
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`)
  return Buffer.from(await response.arrayBuffer())
}
const base = `https://github.com/cli/cli/releases/download/v${version}`
const sums = (await download(`${base}/gh_${version}_checksums.txt`)).toString('utf8')
const expected = sums.split('\n').find(line => line.endsWith(filename))?.split(/\s+/)[0]
if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Missing official checksum')
const zip = await download(`${base}/${filename}`)
if (createHash('sha256').update(zip).digest('hex') !== expected) throw new Error('GitHub CLI checksum mismatch')
const zipPath = path.join(directory, filename)
await writeFile(zipPath, zip)
const extracted = path.join(directory, `gh-${version}-${architecture}`)
await mkdir(extracted, { recursive: true })
execFileSync('/usr/bin/ditto', ['-x', '-k', zipPath, extracted])
const gh = path.join(extracted, `gh_${version}_macOS_${architecture}`, 'bin', 'gh')
await chmod(gh, 0o755)
const ghLicense = path.join(directory, 'GitHub-CLI-LICENSE.txt')
const nodeLicense = path.join(directory, 'Node-LICENSE.txt')
await writeFile(ghLicense, await download(`https://raw.githubusercontent.com/cli/cli/v${version}/LICENSE`))
await writeFile(nodeLicense, await download(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`))
await writeFile(path.join(directory, 'tools.json'), JSON.stringify({ gh, ghLicense, nodeLicense, ghVersion: version, checksum: expected }))
console.log(JSON.stringify({ gh, ghLicense, nodeLicense, checksum: expected }))
