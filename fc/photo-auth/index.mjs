import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const allowOrigin = process.env.ALLOW_ORIGIN
const cdnBaseUrl = process.env.CDN_MEDIA_BASE_URL
const cdnAuthKey = process.env.CDN_AUTH_KEY
const authValidSeconds = Number(process.env.CDN_AUTH_VALID_SECONDS || '1800')
const authOverlapSeconds = Number(process.env.CDN_AUTH_OVERLAP_SECONDS || '900')

// ALLOW_ORIGIN 不设默认值：漏配时直接报错，避免跨域来源悄悄落到别人的域名上
if (!cdnBaseUrl || !cdnAuthKey || !allowOrigin) {
  throw new Error('CDN_MEDIA_BASE_URL, CDN_AUTH_KEY and ALLOW_ORIGIN are required')
}

const manifestPath = path.join(process.cwd(), 'manifest.photos.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

const photoMap = new Map()

for (const item of manifest.data || []) {
  photoMap.set(item.id, {
    originalKey: item.s3Key,
    liveVideoKey: item.video?.type === 'live-photo' ? item.video.s3Key : null,
  })
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '3600',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

function parseEvent(event) {
  const raw = typeof event === 'string' ? event : event?.toString?.() || '{}'
  return JSON.parse(raw)
}

function parseRoute(rawPath) {
  const original = rawPath.match(/^\/original\/([^/]+)$/)
  if (original) {
    return { kind: 'original', photoId: decodeURIComponent(original[1]) }
  }

  const live = rawPath.match(/^\/live\/([^/]+)$/)
  if (live) {
    return { kind: 'live', photoId: decodeURIComponent(live[1]) }
  }

  if (rawPath === '/health') {
    return { kind: 'health' }
  }

  return { kind: 'not-found' }
}

function buildTypeAAuthKey(encodedPath, timestamp, rand, uid, privateKey) {
  const source = `${encodedPath}-${timestamp}-${rand}-${uid}-${privateKey}`
  return crypto.createHash('md5').update(source).digest('hex')
}

function getWindowedTimestamp(validSeconds, overlapSeconds) {
  const now = Math.floor(Date.now() / 1000)
  const windowSize = Math.max(1, validSeconds)
  const overlap = Math.max(0, overlapSeconds)
  const windowStart = Math.floor(now / windowSize) * windowSize
  return windowStart + windowSize + overlap
}

function hmacHex(input) {
  return crypto.createHmac('sha256', cdnAuthKey).update(input).digest('hex')
}

// uid 由客户端 IP 派生：不同访客拿到不同链接，CDN 日志里可按 uid 追溯泄露的链接；
// 用 HMAC 而非明文，避免在 URL 里暴露 IP
function buildClientUid(clientIp) {
  return hmacHex(`ip:${clientIp}`).slice(0, 12)
}

// 同一访客、同一对象、同一时间窗口内 rand 保持不变，浏览器缓存仍可复用
function buildStableRand(objectKey, timestamp, uid) {
  return hmacHex(`${objectKey}:${timestamp}:${uid}`).slice(0, 16)
}

function createSignedCdnUrl(objectKey, clientIp) {
  const resourcePath = `/${objectKey.replace(/^\/+/, '')}`
  const encodedPath = encodeURI(resourcePath)

  const timestamp = getWindowedTimestamp(authValidSeconds, authOverlapSeconds)
  const uid = buildClientUid(clientIp)
  const rand = buildStableRand(objectKey, timestamp, uid)
  const hash = buildTypeAAuthKey(encodedPath, timestamp, rand, uid, cdnAuthKey)

  const authKey = `${timestamp}-${rand}-${uid}-${hash}`
  const url = new URL(encodedPath, cdnBaseUrl)
  url.searchParams.set('auth_key', authKey)
  return url.toString()
}

export const handler = async (event, context) => {
  const req = parseEvent(event)
  const method = req?.requestContext?.http?.method || 'GET'
  const rawPath = req?.rawPath || '/'
  // 只取网关记录的连接来源 IP，不信任可被伪造的 X-Forwarded-For
  const clientIp = req?.requestContext?.http?.sourceIp || ''

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      isBase64Encoded: false,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '3600',
        'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
      body: '',
    }
  }

  const route = parseRoute(rawPath)

  if (route.kind === 'health') {
    return jsonResponse(200, {
      ok: true,
      function: context?.function?.name || 'afilmory-photo-auth',
      authValidSeconds,
    })
  }

  if (route.kind === 'not-found') {
    return jsonResponse(404, { message: 'Not Found' })
  }

  const photo = photoMap.get(route.photoId)
  if (!photo) {
    return jsonResponse(404, { message: 'Photo Not Found' })
  }

  let objectKey = null
  if (route.kind === 'original') {
    objectKey = photo.originalKey
  } else if (route.kind === 'live') {
    objectKey = photo.liveVideoKey
  }

  if (!objectKey) {
    return jsonResponse(404, { message: 'Resource Not Found' })
  }

  try {
    const signedUrl = createSignedCdnUrl(objectKey, clientIp)

    return {
      statusCode: 302,
      isBase64Encoded: false,
      headers: {
        Location: signedUrl,
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '3600',
        'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
      body: '',
    }
  } catch (error) {
    console.error('Failed to sign CDN URL', error)
    return jsonResponse(500, { message: 'Failed to sign url' })
  }
}
