const BYTES_PER_MB = 1024 * 1024
const EDGE_SLASHES_PATTERN = /^\/+|\/+$/g
const PATH_SEPARATOR_PATTERN = /[\\/]+/
const REPEATED_SLASHES_PATTERN = /\/+/g

export function normalizePath(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value
    .replaceAll('\\', '/')
    .replaceAll(REPEATED_SLASHES_PATTERN, '/')
    .replaceAll(EDGE_SLASHES_PATTERN, '')
}

export function normalizeKeyPath(raw: string | undefined | null): string {
  if (!raw) {
    return ''
  }

  const segments = raw.split(PATH_SEPARATOR_PATTERN)
  const safeSegments: string[] = []

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed === '.' || trimmed === '..') {
      continue
    }
    safeSegments.push(trimmed)
  }

  return safeSegments.join('/')
}

export function formatBytesForDisplay(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fixed = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${fixed} ${units[unitIndex]}`
}

export function formatBytesToMb(bytes: number): number {
  const mb = bytes / BYTES_PER_MB
  return Number(mb.toFixed(2))
}

export function normalizeDirectoryValue(value: string | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeRequestHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value
  })
  return result
}

export function joinSegments(...segments: Array<string | null | undefined>): string {
  const parts: string[] = []

  for (const raw of segments) {
    if (!raw) {
      continue
    }
    const normalized = raw
      .replaceAll('\\', '/')
      .replaceAll(EDGE_SLASHES_PATTERN, '')
      .trim()
    if (normalized.length > 0) {
      parts.push(normalized)
    }
  }

  return parts.join('/')
}
