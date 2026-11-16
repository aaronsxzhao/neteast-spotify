// Read-only, resumable catalog review. A completed request is evidence, not a
// completed song review: humans still establish identity from these results.
import { createHash } from 'node:crypto'

export function reviewJobKey(job) {
  if (!['track', 'album', 'search'].includes(job?.type)) throw Error('Invalid review job type')
  if (job.type !== 'search' && !/^[A-Za-z0-9]{22}$/.test(job.id || '')) throw Error('Invalid catalog ID')
  if (job.type === 'search' && (typeof job.query !== 'string' || !job.query.trim() || job.query.length > 400)) throw Error('Invalid review query')
  return createHash('sha256').update(JSON.stringify([job.type, job.id || job.query])).digest('hex')
}
function trackMetadata(t) {
  return { id: t.id, name: t.name, duration_ms: t.duration_ms, is_playable: t.restrictions?.reason ? false : t.is_playable,
    restrictions: t.restrictions?.reason ? { reason: t.restrictions.reason } : undefined,
    artists: t.artists?.map(a => ({ id: a.id, name: a.name })),
    album: t.album && { id: t.album.id, name: t.album.name } }
}
export async function runCatalogReview(client, { accountId, playlistId, jobs, progress = {}, save = async () => {} }) {
  for (const job of jobs) reviewJobKey(job)
  if (progress.accountId && progress.accountId !== accountId) throw Error('Review account changed')
  if (progress.playlistId && progress.playlistId !== playlistId) throw Error('Review playlist changed')
  Object.assign(progress, { accountId, playlistId })
  progress.results ||= {}
  try {
    // No writes, no refresh/cooldown bypass. Every call uses the shared client.
    const me = await client.request('/me')
    if (me.id !== accountId) throw Error('Wrong Spotify account')
    const playlist = await client.request(`/playlists/${playlistId}?fields=id,name,owner(id),items(total)`)
    if (playlist.owner?.id !== accountId || playlist.id !== playlistId) throw Error('Wrong playlist owner')
    delete progress.blocked
    progress.requestPlanComplete = false
    progress.verifiedAt = new Date().toISOString()
    progress.playlist = { id: playlist.id, name: playlist.name, total: playlist.items?.total }
    for (const job of jobs) {
      const key = reviewJobKey(job)
      if (progress.results[key]) continue
      let tracks
      if (job.type === 'track') tracks = [await client.request(`/tracks/${job.id}`)]
      else if (job.type === 'search') tracks = await client.searchTracks(job.query, 10)
      else {
        const album = await client.request(`/albums/${job.id}`)
        // First embedded page only; continuation must be an explicit budgeted
        // job, not following an arbitrary remote next URL.
        tracks = (album.tracks?.items || []).map(t => ({ ...t, album: { id: album.id, name: album.name } }))
        if (album.tracks?.next) progress.albumPagesPending = [...new Set([...(progress.albumPagesPending || []),job.id])]
      }
      progress.results[key] = { job, checkedAt: new Date().toISOString(), tracks: tracks.map(trackMetadata) }
      await save(progress)
    }
    delete progress.blocked
    progress.requestPlanComplete = true
    await save(progress)
  } catch (error) {
    progress.requestPlanComplete = false
    progress.blocked = { reason: error.pauseReason || 'verification-failed', retryAt: error.retryAt,
      status: error.status, networkCode: error.networkCode, at: new Date().toISOString() }
    await save(progress)
    throw error
  }
  return progress
}
