import type { BetterAuthOptions } from 'better-auth'

export const AUTH_ACCOUNT_POLICY = {
  // The OAuth gateway forwards the callback across a cross-subdomain
  // redirect hop (auth.<domain> -> <tenant>.<domain>), which real
  // browsers can drop the auth-state cookie on depending on SameSite
  // enforcement. The gateway's HMAC-signed state envelope plus Better
  // Auth's own DB-backed verification record already authenticate the
  // callback, so this redundant cookie check is safe to skip.
  skipStateCookieCheck: true,
  accountLinking: {
    // Explicit linking already requires an authenticated session and stores
    // that user's id in the one-time OAuth state. Provider email equality is
    // therefore not an ownership boundary, and would reject valid identities
    // such as Sign in with Apple private-relay addresses or alternate Google
    // accounts. Better Auth still rejects provider accounts owned by another
    // Afilmory user.
    allowDifferentEmails: true,
  },
} as const satisfies NonNullable<BetterAuthOptions['account']>
