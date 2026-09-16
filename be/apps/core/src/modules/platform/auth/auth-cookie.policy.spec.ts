import type { BetterAuthOptions } from 'better-auth'
import { getCookies } from 'better-auth/cookies'
import { describe, expect, it } from 'vitest'

import { AUTH_COOKIE_POLICY, AUTH_COOKIE_PREFIX } from './auth-cookie.policy'

describe('auth cookie isolation', () => {
  it.each([
    ['managed tenant', 'https://alpha.afilmory.art'],
    ['platform root', 'https://afilmory.art'],
    ['mobile broker', 'https://api.afilmory.art'],
    ['custom domain', 'https://photos.example.net'],
  ])('emits host-only Better Auth cookies on the %s host', (_label, baseURL) => {
    const cookies = getCookies({
      baseURL,
      advanced: AUTH_COOKIE_POLICY,
    } as BetterAuthOptions)

    expect(cookies.sessionToken.name).toBe(`__Secure-${AUTH_COOKIE_PREFIX}.session_token`)
    for (const cookie of Object.values(cookies)) {
      expect(cookie.attributes).not.toHaveProperty('domain')
      expect(cookie.attributes).toMatchObject({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      })
    }
  })
})
