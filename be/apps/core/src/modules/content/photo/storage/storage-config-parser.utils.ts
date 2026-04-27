import type { S3CompatibleConfig } from '@afilmory/builder/storage/interfaces.js'
import { normalizeStringToUndefined } from '@core/helpers/normalize.helper'

/**
 * Parses a string value to S3 retry mode.
 * Returns undefined if the value is not a valid retry mode.
 */
export function parseRetryMode(value?: string | null): S3CompatibleConfig['retryMode'] | undefined {
  const normalized = normalizeStringToUndefined(value)
  if (!normalized) {
    return undefined
  }

  if (normalized === 'standard' || normalized === 'adaptive' || normalized === 'legacy') {
    return normalized
  }

  return undefined
}
