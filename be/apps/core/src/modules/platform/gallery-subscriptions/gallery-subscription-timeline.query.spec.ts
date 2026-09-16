import { Buffer } from 'node:buffer'

import { ErrorCode } from '@core/errors'
import { BizException } from '@core/errors/biz-exception'
import { describe, expect, it } from 'vitest'

import { parseTimelineQuery } from './gallery-subscription-timeline.query'

describe('parseTimelineQuery', () => {
  it('rejects an invalid time zone', () => {
    try {
      parseTimelineQuery({ timeZone: 'Nope' })
      throw new Error('expected parseTimelineQuery to throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(BizException)
      expect((error as BizException).code).toBe(ErrorCode.COMMON_BAD_REQUEST)
      expect((error as BizException).getHttpStatus()).toBe(400)
    }
  })

  it('clamps limit and decodes a cursor', () => {
    const parsed = parseTimelineQuery({
      timeZone: 'UTC',
      limit: 99,
      cursor: Buffer.from(
        JSON.stringify({ latestAt: '2026-08-19T00:00:00.000Z', tenantId: 't', day: '2026-08-19' }),
        'utf8',
      ).toString('base64url'),
    })
    expect(parsed.limit).toBe(40)
    expect(parsed.cursor?.tenantId).toBe('t')
  })
})
