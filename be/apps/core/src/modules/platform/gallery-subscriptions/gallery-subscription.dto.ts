import { createZodSchemaDto } from '@tsuki-hono/common'
import { z } from 'zod'

const gallerySubscriptionTargetSchema = z.object({
  tenantId: z.string().trim().min(1).max(128),
})

export class GallerySubscriptionTargetDto extends createZodSchemaDto(gallerySubscriptionTargetSchema) {}

export class GallerySubscriptionTimelineQueryDto extends createZodSchemaDto(
  z.object({
    timeZone: z.string().trim().min(1).max(80),
    limit: z.coerce.number().int().min(1).max(40).default(20),
    cursor: z.string().trim().min(1).optional(),
  }),
) {}
