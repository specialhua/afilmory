import process from 'node:process'

const strict = process.env.AFILMORY_SITE_STRICT === '1' || process.env.CI === 'true'
const api = process.env.PUBLIC_API_URL

if (!api) {
  if (strict) {
    console.error('[site] PUBLIC_API_URL is required for production builds (set AFILMORY_SITE_STRICT=0 to skip).')
    process.exit(1)
  }
  console.warn('[site] PUBLIC_API_URL unset — create-space / discover will use relative /api or fail at runtime.')
}
