import type { BetterAuthOptions } from 'better-auth'

// The namespace is intentionally different from the former domain-wide
// `afilmory-global` cookies. Browsers can retain those cookies until their
// original expiry, so reusing the name would make host-only and parent-domain
// cookies ambiguous on managed tenant hosts.
export const AUTH_COOKIE_PREFIX = 'afilmory-tenant'

// A Platform User remains global, but browser credentials are isolated to the
// exact host that created them. Better Auth omits the Domain attribute when
// cross-subdomain cookies are disabled, producing a host-only cookie on tenant,
// platform, broker, localhost, and custom-domain hosts alike.
export const AUTH_COOKIE_POLICY = {
  cookiePrefix: AUTH_COOKIE_PREFIX,
  crossSubDomainCookies: { enabled: false },
} as const satisfies NonNullable<BetterAuthOptions['advanced']>
