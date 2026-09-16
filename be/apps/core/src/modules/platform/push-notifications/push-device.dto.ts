import { createZodSchemaDto } from '@tsuki-hono/common'
import { z } from 'zod'

const apnsDeviceTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[0-9a-f]+$/i, 'The APNs device token must be hexadecimal.')
  .transform(value => value.toLowerCase())

const registerPushDeviceSchema = z.object({
  appVersion: z.string().trim().min(1).max(64).optional(),
  environment: z.enum(['development', 'production']),
  locale: z.string().trim().min(1).max(64).optional(),
  token: apnsDeviceTokenSchema,
})

const unregisterPushDeviceSchema = z.object({
  token: apnsDeviceTokenSchema,
})

export class RegisterPushDeviceDto extends createZodSchemaDto(registerPushDeviceSchema) {}

export class UnregisterPushDeviceDto extends createZodSchemaDto(unregisterPushDeviceSchema) {}
