import { SyncService } from './sync.js'
import { InstallerError } from './installer-github.js'

export function localSyncAllowed(state) {
  return !state.installer?.repository && !state.installer?.deployed && !state.installer?.maintenance
}

export async function runManualSync(store, spotify, getRecommendations) {
  if (!localSyncAllowed(store.state)) throw new InstallerError('云端已接管或正在配置，请使用云端同步，或先完成云端配置。')
  if (!store.state.settings.neteaseCookie || !store.state.spotify.refreshToken || !store.state.settings.spotifyClientId) {
    throw new InstallerError('请先连接网易云和 Spotify。')
  }
  spotify.safety?.check()
  spotify.safety?.beginRun()
  await store.update(state => { state.settings.scheduleEnabled = false })
  // Save a newly created destination BEFORE searching/publishing, so a paused
  // run can resume without making another playlist or invalidating its cache.
  if (!store.state.sync.playlistId) {
    const playlist = await spotify.createPlaylist(store.state.settings.playlistName, false)
    await store.update(state => {
      state.sync.playlistId = playlist.id
      state.sync.playlistUrl = playlist.external_urls?.spotify
    })
  }
  return new SyncService(store, spotify, getRecommendations).run({ requireExistingPlaylist: true, rejectEmptyMatches: true })
}
