import { siteConfig } from '~/config'
import { apiFetch } from '~/lib/api/http'

export const getWalineServerURL = () => siteConfig.comments?.waline?.serverURL?.trim() ?? ''

export const getWalineCommentPath = (photoId: string) => `/photos/${photoId}`

const getWalineCommentEndpoint = () => {
  const serverURL = getWalineServerURL()
  if (!serverURL) {
    return ''
  }

  const baseURL = serverURL.endsWith('/') ? serverURL : `${serverURL}/`
  return new URL('api/comment', baseURL).toString()
}

const parseWalineCount = (payload: unknown, path: string): number => {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return payload
  }

  if (typeof payload === 'string') {
    const value = Number(payload)
    return Number.isFinite(value) ? value : 0
  }

  if (Array.isArray(payload)) {
    const first = payload[0]
    return typeof first === 'number' && Number.isFinite(first) ? first : 0
  }

  if (!payload || typeof payload !== 'object') {
    return 0
  }

  const record = payload as Record<string, unknown>

  if (typeof record.count === 'number' && Number.isFinite(record.count)) {
    return record.count
  }

  const pathCount = record[path]
  if (typeof pathCount === 'number' && Number.isFinite(pathCount)) {
    return pathCount
  }

  if (Array.isArray(record.counts)) {
    const first = record.counts[0]
    return typeof first === 'number' && Number.isFinite(first) ? first : 0
  }

  return 0
}

export const fetchWalineCommentCount = async (photoId: string): Promise<{ count: number }> => {
  const endpoint = getWalineCommentEndpoint()
  if (!endpoint) {
    return { count: 0 }
  }

  const path = getWalineCommentPath(photoId)
  const requestURL = new URL(endpoint)
  requestURL.searchParams.set('type', 'count')
  requestURL.searchParams.set('url', path)

  const payload = await apiFetch<unknown>(requestURL.toString())
  return {
    count: parseWalineCount(payload, path),
  }
}
