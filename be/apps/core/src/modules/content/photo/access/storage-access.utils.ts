import { APP_GLOBAL_PREFIX } from '@core/app.constants'

/**
 * Utility functions for storage access operations
 */

const BYTES_PER_MB = 1024 * 1024

/**
 * Creates a proxy URL for secure storage access
 * @param storageKey - The storage key (object key) to access
 * @param intent - The intent/purpose of the access (e.g., 'photo', 'live-video')
 * @returns The proxy URL for signing the storage access
 */
export function createProxyUrl(storageKey: string, intent = 'photo'): string {
  const params = new URLSearchParams()
  params.set('objectKey', storageKey)
  if (intent) {
    params.set('intent', intent)
  }
  return `${APP_GLOBAL_PREFIX}/storage/sign?${params.toString()}`
}

/**
 * Normalizes a path by:
 * - Converting backslashes to forward slashes
 * - Collapsing multiple slashes into one
 * - Removing leading and trailing slashes
 * @param value - The path to normalize
 * @returns Normalized path string, or empty string if input is empty/null
 */
export function normalizePath(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value
    .replaceAll('\\', '/')
    .replaceAll(/\/+/g, '/')
    .replaceAll(/^\/+|\/+$/g, '')
}

/**
 * Normalizes a key path by:
 * - Splitting on both backslashes and forward slashes
 * - Removing empty segments, '.', and '..'
 * - Joining with forward slashes
 * @param raw - The raw key path to normalize
 * @returns Normalized key path, or empty string if input is empty/null
 */
export function normalizeKeyPath(raw: string | undefined | null): string {
  if (!raw) {
    return ''
  }

  const segments = raw.split(/[\\/]+/)
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

/**
 * Formats bytes to a human-readable string with appropriate unit (B, KB, MB, GB, TB)
 * @param bytes - The number of bytes to format
 * @returns Formatted string (e.g., "1.5 MB", "500 KB")
 */
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

/**
 * Converts bytes to megabytes (MB) with 2 decimal places
 * @param bytes - The number of bytes to convert
 * @returns The number of megabytes, rounded to 2 decimal places
 */
export function formatBytesToMb(bytes: number): number {
  const mb = bytes / BYTES_PER_MB
  return Number(mb.toFixed(2))
}

/**
 * Normalizes a directory value by trimming whitespace
 * @param value - The directory value to normalize
 * @returns Normalized directory string, or null if empty
 */
export function normalizeDirectoryValue(value: string | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalizes request headers by converting all keys to lowercase
 * @param headers - The Headers object to normalize
 * @returns Record with lowercase keys
 */
export function normalizeRequestHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value
  })
  return result
}

/**
 * Joins path segments into a single path string.
 * - Filters out null, undefined, and empty values
 * - Converts backslashes to forward slashes
 * - Removes leading and trailing slashes from each segment
 * - Trims whitespace from each segment
 * - Joins segments with forward slashes
 * @param segments - Array of path segments to join (can include null/undefined)
 * @returns Joined path string, or empty string if no valid segments
 */
export function joinSegments(...segments: Array<string | null | undefined>): string {
  const parts: string[] = []

  for (const raw of segments) {
    if (!raw) {
      continue
    }
    const normalized = raw
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')
      .trim()
    if (normalized.length > 0) {
      parts.push(normalized)
    }
  }

  return parts.join('/')
}
