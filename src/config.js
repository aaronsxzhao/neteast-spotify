export const HOST = process.env.HOST || '127.0.0.1'
export const PORT = Number(process.env.PORT || 8787)
export const APP_ORIGIN = process.env.APP_ORIGIN || `http://${HOST}:${PORT}`
export const SPOTIFY_REDIRECT_URI = `${APP_ORIGIN}/auth/spotify/callback`

export const DEFAULT_SETTINGS = {
  spotifyClientId: '',
  neteaseCookie: '',
  playlistName: 'NetEase Daily Recommendations',
  playlistPublic: false,
  scheduleEnabled: true,
  scheduleHour: 8,
  timezone: 'Asia/Shanghai',
}

export const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'ugc-image-upload',
  'user-read-private',
]
