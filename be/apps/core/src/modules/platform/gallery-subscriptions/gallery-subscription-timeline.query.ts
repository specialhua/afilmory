import { BizException, ErrorCode } from '@core/errors'

import type { TimelineCursor } from './gallery-subscription-timeline.policy'
import {
  decodeTimelineCursor,
  isValidTimeZone,
  TIMELINE_EVENT_LIMIT_DEFAULT,
  TIMELINE_EVENT_LIMIT_MAX,
} from './gallery-subscription-timeline.policy'

export function parseTimelineQuery(input: { cursor?: string, limit?: number, timeZone: string }): {
  cursor: TimelineCursor | null
  limit: number
  timeZone: string
} {
  if (!isValidTimeZone(input.timeZone)) {
    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Invalid time zone.' })
  }

  let cursor: TimelineCursor | null = null
  if (input.cursor) {
    cursor = decodeTimelineCursor(input.cursor)
    if (!cursor) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Invalid cursor.' })
    }
  }

  const limit = Math.min(TIMELINE_EVENT_LIMIT_MAX, Math.max(1, input.limit ?? TIMELINE_EVENT_LIMIT_DEFAULT))

  return { timeZone: input.timeZone, limit, cursor }
}
