import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let api

function loadApi() {
  if (!api) api = require('@neteasecloudmusicapienhanced/api')
  return api
}

export async function getDailyRecommendations(cookie) {
  if (!cookie?.includes('MUSIC_U=')) {
    throw new Error('NetEase cookie must include MUSIC_U=…')
  }

  const netease = loadApi()
  if (typeof netease.recommend_songs !== 'function') {
    throw new Error('The installed NetEase API does not expose recommend_songs')
  }

  const response = await netease.recommend_songs({ cookie })
  const body = response?.body || response
  if (body?.code !== 200) {
    const message = body?.message || body?.msg || `NetEase returned code ${body?.code || 'unknown'}`
    throw new Error(message)
  }

  const songs = body?.data?.dailySongs || body?.recommend || []
  if (!Array.isArray(songs) || songs.length === 0) {
    throw new Error('NetEase returned no daily recommendations; the cookie may be expired')
  }
  return songs
}

export async function createQrLogin() {
  const netease = loadApi()
  const keyResponse = await netease.login_qr_key({ timestamp: Date.now() })
  const key = keyResponse?.body?.data?.unikey
  if (!key) throw new Error('NetEase could not create a login QR code')

  const qrResponse = await netease.login_qr_create({
    key,
    qrimg: true,
    platform: 'web',
    timestamp: Date.now(),
  })
  const qrimg = qrResponse?.body?.data?.qrimg
  if (!qrimg) throw new Error('NetEase returned an empty login QR code')
  return { key, qrimg }
}

export async function checkQrLogin(key) {
  const netease = loadApi()
  const response = await netease.login_qr_check({
    key,
    noCookie: true,
    timestamp: Date.now(),
  })
  const body = response?.body || {}
  const cookie = body.cookie || (Array.isArray(response?.cookie) ? response.cookie.join(';') : '')
  return {
    code: Number(body.code || 0),
    message: body.message || body.msg || '',
    cookie,
  }
}
