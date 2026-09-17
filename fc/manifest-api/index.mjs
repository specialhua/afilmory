import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

// 只读的 manifest JSON 接口，供站外应用（博客编辑器、正文里的相册区块）读取相册数据。
// 路由与官方后端 be/apps/core 的 ManifestPublicController 保持一致，
// 这样站外应用把 baseUrl 指到本函数的域名即可，无需为静态部署单独适配。

// ALLOW_ORIGINS 不设默认值：漏配时直接报错，避免接口对任意来源开放
const allowOrigins = (process.env.ALLOW_ORIGINS || '')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter(Boolean)
// 站点公开地址，用于把 manifest 里的相对路径（/thumbnails/xxx.webp）补成绝对地址
const siteBaseUrl = (process.env.SITE_BASE_URL || '').trim().replace(/\/+$/, '')
const cacheSeconds = Number(process.env.CACHE_SECONDS || '300')
const gzipEnabled = process.env.GZIP !== '0'

if (allowOrigins.length === 0 || !siteBaseUrl) {
  throw new Error('ALLOW_ORIGINS and SITE_BASE_URL are required')
}

// 函数计算响应体上限 6MB；未压缩且超限时只能在日志里报警，客户端会拿到截断的错误
const RESPONSE_SIZE_LIMIT = 6 * 1024 * 1024
const GZIP_MIN_BYTES = 1024

const manifestPath = path.join(process.cwd(), 'manifest.photos.json')
const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

function absolutizeUrl(url) {
  if (typeof url !== 'string' || url === '') {
    return url
  }
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
    return url
  }
  return `${siteBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

// s3Key 是私有桶里的对象名，站外应用用不到，不放进公开接口
function sanitizePhoto(item) {
  const { s3Key, ...photo } = item
  photo.thumbnailUrl = absolutizeUrl(photo.thumbnailUrl)
  photo.originalUrl = absolutizeUrl(photo.originalUrl)
  if (photo.video && typeof photo.video === 'object') {
    const { s3Key: videoKey, ...video } = photo.video
    photo.video = video
  }
  return photo
}

const photos = (rawManifest.data || []).map(sanitizePhoto)
const photoById = new Map(photos.map((photo) => [photo.id, photo]))

// 全量 manifest 在冷启动时序列化并压缩一次，之后每次请求直接复用
const manifestBody = JSON.stringify({
  version: rawManifest.version || 'v6',
  data: photos,
  cameras: rawManifest.cameras || [],
  lenses: rawManifest.lenses || [],
})
const manifestEtag = `"${crypto.createHash('sha1').update(manifestBody).digest('hex')}"`
const manifestGzip = gzipEnabled ? zlib.gzipSync(Buffer.from(manifestBody, 'utf-8')) : null

function resolveAllowOrigin(origin) {
  if (!origin) {
    return null
  }
  const normalized = origin.trim().replace(/\/+$/, '')
  return allowOrigins.includes(normalized) ? origin : null
}

function baseHeaders(allowOrigin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin, Accept-Encoding',
  }
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin
  }
  return headers
}

function jsonResponse(statusCode, body, { allowOrigin, acceptsGzip, cache, extraHeaders } = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache || `public, max-age=${cacheSeconds}`,
    ...baseHeaders(allowOrigin),
    ...extraHeaders,
  }

  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const raw = Buffer.from(text, 'utf-8')

  if (gzipEnabled && acceptsGzip && raw.byteLength >= GZIP_MIN_BYTES) {
    const gzipped = text === manifestBody && manifestGzip ? manifestGzip : zlib.gzipSync(raw)
    return {
      statusCode,
      isBase64Encoded: true,
      headers: { ...headers, 'Content-Encoding': 'gzip' },
      body: gzipped.toString('base64'),
    }
  }

  if (raw.byteLength > RESPONSE_SIZE_LIMIT) {
    console.error(`Response too large: ${raw.byteLength} bytes (client did not accept gzip)`)
  }

  return { statusCode, isBase64Encoded: false, headers, body: text }
}

function parseEvent(event) {
  const raw = typeof event === 'string' ? event : event?.toString?.() || '{}'
  return JSON.parse(raw)
}

function readHeader(headers, name) {
  if (!headers) {
    return ''
  }
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return Array.isArray(value) ? value.join(',') : String(value ?? '')
    }
  }
  return ''
}

function readQueryValue(req, name) {
  const value = req?.queryParameters?.[name]
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  if (typeof value === 'string') {
    return value
  }
  // rawPath 一般不带查询串，这里只是兜底
  const rawQuery = typeof req?.rawQueryString === 'string' ? req.rawQueryString : ''
  if (!rawQuery) {
    return ''
  }
  return new URLSearchParams(rawQuery).get(name) || ''
}

function readBody(req) {
  const raw = req?.body
  if (typeof raw !== 'string' || raw === '') {
    return {}
  }
  const text = req?.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf-8') : raw
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// 自定义域名可能把函数挂在 /api 前缀下，两种路径都能识别
function parseRoute(rawPath) {
  const withoutQuery = rawPath.split('?')[0]
  const normalized = withoutQuery.replace(/\/+$/, '') || '/'
  const routePath = normalized.startsWith('/api/') ? normalized.slice(4) : normalized

  if (routePath === '/health') {
    return { kind: 'health' }
  }
  if (routePath === '/manifest') {
    return { kind: 'manifest' }
  }
  if (routePath === '/manifest/photos') {
    return { kind: 'photos-by-ids' }
  }
  if (routePath === '/manifest/photos/search') {
    return { kind: 'search' }
  }

  const photo = routePath.match(/^\/manifest\/photos\/([^/]+)$/)
  if (photo) {
    return { kind: 'photo', photoId: decodeURIComponent(photo[1]) }
  }

  // 站外应用用同一个 baseUrl 拼照片详情页链接，这里跳回站点
  const detail = routePath.match(/^\/photos\/([^/]+)$/)
  if (detail) {
    return { kind: 'photo-page', photoId: decodeURIComponent(detail[1]) }
  }

  return { kind: 'not-found' }
}

function toTimestamp(value) {
  if (!value) {
    return 0
  }
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

// EXIF 字段偶尔会是数字或缺失，统一按字符串处理，避免函数因为一张照片整体报错
function exifText(photo, field) {
  const value = photo.exif?.[field]
  if (value === undefined || value === null) {
    return ''
  }
  return String(value).trim()
}

function cameraName(photo) {
  const make = exifText(photo, 'Make')
  const model = exifText(photo, 'Model')
  return make && model ? `${make} ${model}` : null
}

function lensName(photo) {
  const model = exifText(photo, 'LensModel')
  if (!model) {
    return null
  }
  const make = exifText(photo, 'LensMake')
  return make ? `${make} ${model}` : model
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => typeof item === 'string' && item !== '')
}

// 过滤语义与 be/apps/core 的 ManifestService.searchPhotos 保持一致
function searchPhotos(query) {
  let result = photos

  const tags = toStringArray(query.tags)
  if (tags.length > 0) {
    result =
      query.tagMode === 'intersection'
        ? result.filter((photo) => tags.every((tag) => (photo.tags || []).includes(tag)))
        : result.filter((photo) => tags.some((tag) => (photo.tags || []).includes(tag)))
  }

  const cameras = toStringArray(query.cameras)
  if (cameras.length > 0) {
    const set = new Set(cameras)
    result = result.filter((photo) => {
      const name = cameraName(photo)
      return name ? set.has(name) : false
    })
  }

  const lenses = toStringArray(query.lenses)
  if (lenses.length > 0) {
    const set = new Set(lenses)
    result = result.filter((photo) => {
      const name = lensName(photo)
      return name ? set.has(name) : false
    })
  }

  if (typeof query.rating === 'number' && Number.isFinite(query.rating)) {
    const threshold = query.rating
    result = result.filter((photo) => (photo.exif?.Rating ?? 0) >= threshold)
  }

  if (query.from || query.to) {
    const fromTs = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY
    const toTs = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : Number.POSITIVE_INFINITY
    result = result.filter((photo) => {
      const candidates = [photo.dateTaken, photo.exif?.DateTimeOriginal, photo.lastModified]
      for (const candidate of candidates) {
        if (!candidate) {
          continue
        }
        const time = toTimestamp(candidate)
        if (time) {
          return time >= fromTs && time <= toTs
        }
      }
      return false
    })
  }

  // manifest 已按拍摄时间倒序，asc 直接反转即可
  if (query.sort === 'asc') {
    result = [...result].reverse()
  }

  const total = result.length
  const offset = Number.isInteger(query.offset) && query.offset > 0 ? query.offset : 0
  const limit = Number.isInteger(query.limit) && query.limit > 0 ? query.limit : total
  return { data: result.slice(offset, offset + limit), total }
}

export const handler = async (event, context) => {
  const req = parseEvent(event)
  const method = req?.requestContext?.http?.method || 'GET'
  const rawPath = req?.rawPath || req?.requestContext?.http?.path || '/'
  const allowOrigin = resolveAllowOrigin(readHeader(req?.headers, 'origin'))
  const acceptsGzip = readHeader(req?.headers, 'accept-encoding').toLowerCase().includes('gzip')

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      isBase64Encoded: false,
      headers: { ...baseHeaders(allowOrigin), 'Cache-Control': 'public, max-age=3600' },
      body: '',
    }
  }

  const route = parseRoute(rawPath)
  const respond = (statusCode, body, options) =>
    jsonResponse(statusCode, body, { allowOrigin, acceptsGzip, ...options })

  switch (route.kind) {
    case 'health':
      return respond(
        200,
        {
          ok: true,
          function: context?.function?.name || 'afilmory-manifest-api',
          photos: photos.length,
          manifestBytes: Buffer.byteLength(manifestBody),
          manifestGzipBytes: manifestGzip ? manifestGzip.byteLength : null,
          etag: manifestEtag,
        },
        { cache: 'no-store' },
      )

    case 'manifest': {
      if (
        readHeader(req?.headers, 'if-none-match')
          .split(',')
          .some((tag) => tag.trim() === manifestEtag)
      ) {
        return {
          statusCode: 304,
          isBase64Encoded: false,
          headers: {
            ETag: manifestEtag,
            'Cache-Control': `public, max-age=${cacheSeconds}`,
            ...baseHeaders(allowOrigin),
          },
          body: '',
        }
      }
      return respond(200, manifestBody, { extraHeaders: { ETag: manifestEtag } })
    }

    case 'photos-by-ids': {
      const ids = readQueryValue(req, 'ids')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
      // 按请求顺序返回，找不到的直接跳过，与官方后端一致
      return respond(200, ids.map((id) => photoById.get(id)).filter(Boolean))
    }

    case 'search': {
      if (method !== 'POST') {
        return respond(405, { message: 'Method Not Allowed' }, { cache: 'no-store' })
      }
      return respond(200, searchPhotos(readBody(req)))
    }

    case 'photo': {
      const photo = photoById.get(route.photoId)
      if (!photo) {
        return respond(404, { message: '照片不存在' }, { cache: 'no-store' })
      }
      return respond(200, photo)
    }

    case 'photo-page':
      return {
        statusCode: 302,
        isBase64Encoded: false,
        headers: {
          Location: `${siteBaseUrl}/photos/${encodeURIComponent(route.photoId)}`,
          'Cache-Control': `public, max-age=${cacheSeconds}`,
          ...baseHeaders(allowOrigin),
        },
        body: '',
      }

    default:
      return respond(404, { message: 'Not Found' }, { cache: 'no-store' })
  }
}
