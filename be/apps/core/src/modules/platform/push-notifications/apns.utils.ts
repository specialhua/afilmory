import { Buffer } from 'node:buffer'
import type { KeyObject } from 'node:crypto'
import { sign } from 'node:crypto'

export interface APNsResponseDisposition {
  invalidToken: boolean
  retryable: boolean
}

const INVALID_DEVICE_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'])
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503])

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

export function createAPNsProviderToken(input: {
  keyId: string
  privateKey: KeyObject
  teamId: string
  issuedAtSeconds?: number
}): string {
  const issuedAtSeconds = input.issuedAtSeconds ?? Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: input.keyId }))
  const claims = base64Url(JSON.stringify({ iss: input.teamId, iat: issuedAtSeconds }))
  const signingInput = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: input.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${signature.toString('base64url')}`
}

export function classifyAPNsResponse(status: number, reason?: string): APNsResponseDisposition {
  return {
    invalidToken: reason ? INVALID_DEVICE_REASONS.has(reason) : false,
    retryable: status === 0 || RETRYABLE_STATUS_CODES.has(status),
  }
}

export function alternateAPNsEnvironment(environment: 'development' | 'production'): 'development' | 'production' {
  return environment === 'development' ? 'production' : 'development'
}
