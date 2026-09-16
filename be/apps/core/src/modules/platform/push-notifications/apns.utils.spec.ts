import { Buffer } from 'node:buffer'
import { generateKeyPairSync, verify } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { alternateAPNsEnvironment, classifyAPNsResponse, createAPNsProviderToken } from './apns.utils'
import { galleryPushBody } from './gallery-push.copy'

describe('aPNs utilities', () => {
  it('creates a verifiable ES256 provider token with the expected claims', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const token = createAPNsProviderToken({
      issuedAtSeconds: 1_700_000_000,
      keyId: 'KEY123',
      privateKey,
      teamId: 'TEAM123',
    })
    const [header, claims, signature] = token.split('.')

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' })
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iat: 1_700_000_000,
      iss: 'TEAM123',
    })
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { dsaEncoding: 'ieee-p1363', key: publicKey },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true)
  })

  it('separates invalid tokens from retryable provider failures', () => {
    expect(classifyAPNsResponse(410, 'Unregistered')).toEqual({ invalidToken: true, retryable: false })
    expect(classifyAPNsResponse(503, 'Shutdown')).toEqual({ invalidToken: false, retryable: true })
    expect(classifyAPNsResponse(400, 'BadCollapseId')).toEqual({ invalidToken: false, retryable: false })
  })

  it('switches between the APNs sandbox and production environments', () => {
    expect(alternateAPNsEnvironment('development')).toBe('production')
    expect(alternateAPNsEnvironment('production')).toBe('development')
  })

  it('localizes the gallery update body using the registered device locale', () => {
    expect(galleryPushBody('en-US', 1)).toBe('Just published a new photo.')
    expect(galleryPushBody('zh-Hans', 3)).toBe('刚刚发布了 3 张新照片。')
    expect(galleryPushBody('ja-JP', 2)).toBe('新しい写真を2枚公開しました。')
  })
})
