import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { parseConfig } from '../src/cloud-state.js'

// All generated files stay in the existing, Git-ignored owner-only .data folder.
const local = JSON.parse(await readFile('.data/state.json', 'utf8'))
const config = {
  spotifyClientId: local.settings.spotifyClientId,
  spotifyRefreshToken: local.spotify.refreshToken,
  spotifyScope: local.spotify.scope || '',
  neteaseCookie: local.settings.neteaseCookie,
  playlistId: local.sync.playlistId,
  playlistName: local.settings.playlistName,
  playlistPublic: local.settings.playlistPublic,
  timezone: local.settings.timezone,
}
parseConfig(JSON.stringify(config))
await writeFile('.data/DAILY_RELAY_CONFIG.txt', JSON.stringify(config), { mode: 0o600 })
await chmod('.data/DAILY_RELAY_CONFIG.txt', 0o600)
try {
  await writeFile('.data/DAILY_RELAY_STATE_KEY.txt', randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
console.log('Prepared .data/DAILY_RELAY_CONFIG.txt and .data/DAILY_RELAY_STATE_KEY.txt. Add them as GitHub Actions secrets with the matching names. Never commit these files. The existing encryption key is preserved.')
