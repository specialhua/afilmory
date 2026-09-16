import { camelCaseKeys } from '../case'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.toLowerCase().includes('json')
  const body = isJson ? await response.json().catch(() => null) : null

  if (!response.ok) {
    throw new ApiError(`Request failed: ${response.status}`, response.status, body)
  }

  const payload
    = body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)
      ? (body as { data: unknown }).data
      : body
  return camelCaseKeys<T>(payload ?? null)
}
