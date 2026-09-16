import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import { authUsers, commentReactions, comments, photoAssets, tenantMemberships } from '@afilmory/db'
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3'
import { HttpContext } from '@tsuki-hono/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'

import { APP_GLOBAL_PREFIX } from '../app.constants'
import { createConfiguredApp } from '../app.factory'
import { DbAccessor, PgPoolProvider } from '../database/database.provider'
import { logger } from '../helpers/logger.helper'
import { StorageSettingService } from '../modules/configuration/storage-setting/storage-setting.service'
import { SystemSettingService } from '../modules/configuration/system-setting/system-setting.service'
import { PhotoAssetService } from '../modules/content/photo/assets/photo-asset.service'
import type { UploadAssetInput } from '../modules/content/photo/assets/photo-asset.types'
import { resolveFileSizeLimitBytes } from '../modules/content/photo/assets/photo-upload-limits'
import { ROOT_TENANT_SLUG } from '../modules/platform/tenant/tenant.constants'
import { TenantService } from '../modules/platform/tenant/tenant.service'
import type { TenantRecord } from '../modules/platform/tenant/tenant.types'
import { RedisProvider } from '../redis/redis.provider'

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const SEED_FLAG = '--seed-dev'

const DEFAULTS = {
  accessKeyId: 'rustfsadmin',
  bucket: 'afilmory-dev',
  endpoint: 'http://localhost:9300',
  gatewayUrl: 'http://localhost:1841',
  photosDir: fileURLToPath(new URL('../../../../../photos/', import.meta.url)),
  region: 'us-east-1',
  secretAccessKey: 'rustfsadmin',
} as const

export interface SeedDevCliOptions {
  accessKeyId: string
  bucket: string
  endpoint: string
  gatewayUrl: string
  photosDir: string
  region: string
  secretAccessKey: string
  slug: string | null
}

const VALUE_FLAGS = {
  '--access-key': 'accessKeyId',
  '--bucket': 'bucket',
  '--endpoint': 'endpoint',
  '--gateway-url': 'gatewayUrl',
  '--photos-dir': 'photosDir',
  '--region': 'region',
  '--secret-key': 'secretAccessKey',
  '--slug': 'slug',
} as const satisfies Record<string, keyof SeedDevCliOptions>

export function parseSeedDevCliArgs(args: readonly string[]): SeedDevCliOptions | null {
  if (!args.includes(SEED_FLAG)) {
    return null
  }

  const options: SeedDevCliOptions = { ...DEFAULTS, slug: null }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg || !arg.startsWith('--')) {
      continue
    }

    const [flag, inline] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, null]
    if (!(flag in VALUE_FLAGS)) {
      continue
    }

    const field = VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS]
    let value = inline
    if (value === null) {
      const next = args[index + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`)
      }
      value = next
      index++
    }

    const trimmed = value.trim()
    if (trimmed.length === 0) {
      throw new Error(`Missing value for ${flag}`)
    }
    options[field] = trimmed
  }

  return options
}

async function ensureBucket(options: SeedDevCliOptions): Promise<'created' | 'exists'> {
  // RustFS rejects virtual-host bucket addressing with `NotImplemented`, so
  // path-style is mandatory here and in the storage provider config below.
  const client = new S3Client({
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    endpoint: options.endpoint,
    forcePathStyle: true,
    region: options.region,
  })

  try {
    let state: 'created' | 'exists' = 'exists'
    try {
      await client.send(new HeadBucketCommand({ Bucket: options.bucket }))
    }
    catch {
      await client.send(new CreateBucketCommand({ Bucket: options.bucket }))
      state = 'created'
    }

    // Development manifests use direct object URLs, so the local bucket must
    // allow public reads for gallery previews.
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: options.bucket,
        Policy: JSON.stringify({
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Resource: [`arn:aws:s3:::${options.bucket}/*`],
              Sid: 'PublicRead',
            },
          ],
          Version: '2012-10-17',
        }),
      }),
    )

    return state
  }
  finally {
    client.destroy()
  }
}

export async function handleSeedDevCli(options: SeedDevCliOptions): Promise<void> {
  const app = await createConfiguredApp({ globalPrefix: APP_GLOBAL_PREFIX })
  const container = app.getContainer()
  const poolProvider = container.resolve(PgPoolProvider)
  const redisProvider = container.resolve(RedisProvider)
  const summary: string[] = []

  try {
    const bucketState = await ensureBucket(options)
    summary.push(`bucket ${options.bucket} ${bucketState}`)

    const systemSettings = container.resolve(SystemSettingService)
    await systemSettings.updateSettings({ oauthGatewayUrl: options.gatewayUrl })
    summary.push(`oauthGatewayUrl = ${options.gatewayUrl}`)

    if (options.slug) {
      const tenant = await resolveTenant(container.resolve(TenantService), options.slug)
      await configureTenantStorage(container.resolve(StorageSettingService), tenant.id, options)
      summary.push(`workspace ${options.slug} storage -> ${options.endpoint}/${options.bucket}`)
      summary.push(await reportOwner(container, tenant))
      summary.push(...(await seedPhotos(container, tenant, options)))
      summary.push(...(await seedComments(container, tenant)))
    }
    else {
      summary.push('no --slug given, skipped workspace storage and photos')
    }

    stdout.write(`\nLocal dev seed complete\n${summary.map(line => `  - ${line}`).join('\n')}\n\n`)
  }
  finally {
    await app.close('cli')

    try {
      await poolProvider.getPool().end()
    }
    catch (error) {
      logger.warn(`Failed to close PostgreSQL pool cleanly: ${String(error)}`)
    }

    try {
      redisProvider.getClient().disconnect()
    }
    catch (error) {
      logger.warn(`Failed to disconnect Redis client cleanly: ${String(error)}`)
    }
  }
}

const SEED_COMMENT_USER_AGENT = 'afilmory-seed-dev'

async function seedComments(
  container: ReturnType<Awaited<ReturnType<typeof createConfiguredApp>>['getContainer']>,
  tenant: TenantRecord,
): Promise<string[]> {
  const db = container.resolve(DbAccessor).get()
  const [existing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.tenantId, tenant.id), eq(comments.userAgent, SEED_COMMENT_USER_AGENT)))

  if (Number(existing?.count ?? 0) > 0) {
    return [`comments already seeded in ${tenant.slug}`]
  }

  const photos = await db
    .select({ photoId: photoAssets.photoId })
    .from(photoAssets)
    .where(eq(photoAssets.tenantId, tenant.id))
    .orderBy(asc(photoAssets.createdAt), asc(photoAssets.id))

  if (photos.length === 0) {
    return ['no photos available for comment fixtures']
  }

  const [owner] = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenant.id),
        eq(tenantMemberships.role, 'owner'),
        eq(tenantMemberships.status, 'active'),
      ),
    )
    .limit(1)

  if (!owner) {
    return [`${tenant.slug} has no active owner; skipped comment fixtures`]
  }

  const handfulPhotoId = photos[0]!.photoId
  const pagedPhotoId = photos[1]?.photoId ?? handfulPhotoId
  const now = Date.now()
  const timestamp = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

  await db.transaction(async (transaction) => {
    const [parent] = await transaction
      .insert(comments)
      .values({
        tenantId: tenant.id,
        photoId: handfulPhotoId,
        userId: owner.userId,
        content: 'The light in this frame is remarkable.',
        status: 'approved',
        userAgent: SEED_COMMENT_USER_AGENT,
        createdAt: timestamp(180),
        updatedAt: timestamp(180),
      })
      .returning({ id: comments.id })

    if (!parent) {
      throw new Error('Failed to create the parent comment fixture.')
    }

    const [reactionTarget] = await transaction
      .insert(comments)
      .values([
        {
          tenantId: tenant.id,
          photoId: handfulPhotoId,
          parentId: parent.id,
          userId: owner.userId,
          content: 'Agreed — the shadows keep the highlights from feeling harsh.',
          status: 'approved' as const,
          userAgent: SEED_COMMENT_USER_AGENT,
          createdAt: timestamp(150),
          updatedAt: timestamp(150),
        },
        {
          tenantId: tenant.id,
          photoId: handfulPhotoId,
          userId: owner.userId,
          content: 'This belongs in the opening sequence.',
          status: 'approved' as const,
          userAgent: SEED_COMMENT_USER_AGENT,
          createdAt: timestamp(120),
          updatedAt: timestamp(120),
        },
        {
          tenantId: tenant.id,
          photoId: handfulPhotoId,
          userId: owner.userId,
          content: 'The texture is especially strong at full size.',
          status: 'approved' as const,
          userAgent: SEED_COMMENT_USER_AGENT,
          createdAt: timestamp(90),
          updatedAt: timestamp(90),
        },
        {
          tenantId: tenant.id,
          photoId: handfulPhotoId,
          userId: owner.userId,
          content: 'A quiet frame, but one that rewards a longer look.',
          status: 'approved' as const,
          userAgent: SEED_COMMENT_USER_AGENT,
          createdAt: timestamp(60),
          updatedAt: timestamp(60),
        },
      ])
      .returning({ id: comments.id })

    const pagedFixtures = Array.from({ length: 25 }, (_, index) => ({
      tenantId: tenant.id,
      photoId: pagedPhotoId,
      userId: owner.userId,
      content: `Pagination fixture ${String(index + 1).padStart(2, '0')}: a seeded comment for native sheet verification.`,
      status: 'approved' as const,
      userAgent: SEED_COMMENT_USER_AGENT,
      createdAt: timestamp(55 - index * 2),
      updatedAt: timestamp(55 - index * 2),
    }))
    await transaction.insert(comments).values(pagedFixtures)

    if (reactionTarget) {
      await transaction.insert(commentReactions).values({
        tenantId: tenant.id,
        commentId: reactionTarget.id,
        userId: owner.userId,
        reaction: 'like',
      })
    }
  })

  const emptyPhotoCount = Math.max(0, photos.length - (handfulPhotoId === pagedPhotoId ? 1 : 2))
  return [
    `seeded 30 comments across ${handfulPhotoId === pagedPhotoId ? 1 : 2} photo(s)`,
    `${emptyPhotoCount} photo(s) remain without comments`,
  ]
}

async function resolveTenant(tenantService: TenantService, slug: string): Promise<TenantRecord> {
  const tenant = await tenantService.resolve({ slug }, { noThrow: true })
  if (!tenant) {
    throw new Error(`No workspace found for slug "${slug}". Sign in and create it first, then re-run with --slug.`)
  }
  if (slug === ROOT_TENANT_SLUG) {
    throw new Error(
      `The root workspace is excluded from the discovery feed, so photos seeded into it never surface in the app. Use a regular workspace slug.`,
    )
  }
  return tenant.tenant
}

// Studio's management calls are membership-gated, so the summary names the
// account to sign in as. Taking ownership here is not an option: a unique
// index allows only one active owner per workspace.
async function reportOwner(
  container: ReturnType<Awaited<ReturnType<typeof createConfiguredApp>>['getContainer']>,
  tenant: TenantRecord,
): Promise<string> {
  const db = container.resolve(DbAccessor).get()
  const [owner] = await db
    .select({ email: authUsers.email })
    .from(tenantMemberships)
    .innerJoin(authUsers, eq(authUsers.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, tenant.id), eq(tenantMemberships.role, 'owner')))
    .limit(1)
  return owner
    ? `sign in as ${owner.email} to manage ${tenant.slug} in Studio`
    : `${tenant.slug} has no owner; Studio mutations will be rejected`
}

async function seedPhotos(
  container: ReturnType<Awaited<ReturnType<typeof createConfiguredApp>>['getContainer']>,
  tenant: TenantRecord,
  options: SeedDevCliOptions,
): Promise<string[]> {
  const photoAssetService = container.resolve(PhotoAssetService)
  const db = container.resolve(DbAccessor).get()

  let entries: string[]
  try {
    entries = await readdir(options.photosDir)
  }
  catch {
    return [`photos directory ${options.photosDir} not found, skipped`]
  }

  const candidates = entries.filter(name => extname(name).toLowerCase() in CONTENT_TYPES).sort()
  if (candidates.length === 0) {
    return [`no seedable files in ${options.photosDir}`]
  }

  // Keyed by basename, not storage key: a Live Photo's .mov is folded into the
  // still's manifest rather than getting its own row, so matching on the full
  // key would re-upload every video on a second run.
  const rows = await db
    .select({ storageKey: photoAssets.storageKey })
    .from(photoAssets)
    .where(eq(photoAssets.tenantId, tenant.id))
  const existing = new Set(
    rows
      .map(row => row.storageKey)
      .filter((key): key is string => Boolean(key))
      .map(key => basename(key, extname(key)).toLowerCase()),
  )

  // Both the size-limit lookup and the upload read the tenant from
  // AsyncLocalStorage, which only a real request normally populates.
  const honoContext = { req: { method: 'POST', path: '/cli/seed-dev' } } as unknown as Context
  return await HttpContext.run(honoContext, async () => {
    HttpContext.assign({ tenant: { tenant } })

    const fileSizeLimitBytes = resolveFileSizeLimitBytes(await photoAssetService.getUploadSizeLimitBytes())
    const inputs: UploadAssetInput[] = []
    const skipped: string[] = []

    for (const filename of candidates) {
      if (existing.has(basename(filename, extname(filename)).toLowerCase())) {
        continue
      }
      const buffer = await readFile(join(options.photosDir, filename))
      if (buffer.byteLength > fileSizeLimitBytes) {
        skipped.push(`${filename} (${Math.round(buffer.byteLength / 1024 / 1024)} MB)`)
        continue
      }
      inputs.push({ buffer, contentType: CONTENT_TYPES[extname(filename).toLowerCase()], filename })
    }

    const notes: string[] = []
    if (inputs.length === 0) {
      notes.push(`photos already seeded in ${tenant.slug}`)
    }
    else {
      await photoAssetService.uploadAssets(inputs)
      notes.push(`uploaded ${inputs.length} file(s) into ${tenant.slug}`)
    }

    if (skipped.length > 0) {
      notes.push(`skipped over the ${Math.round(fileSizeLimitBytes / 1024 / 1024)} MB limit: ${skipped.join(', ')}`)
    }
    return notes
  })
}

async function configureTenantStorage(
  storageSettings: StorageSettingService,
  tenantId: string,
  options: SeedDevCliOptions,
): Promise<void> {
  const provider = {
    config: {
      accessKeyId: options.accessKeyId,
      bucket: options.bucket,
      customDomain: '',
      endpoint: options.endpoint,
      excludeRegex: '',
      prefix: '',
      region: options.region,
      secretAccessKey: options.secretAccessKey,
    },
    id: 'local-rustfs',
    name: 'Local RustFS',
    type: 's3',
  }

  await storageSettings.setMany([
    { key: 'builder.storage.providers', options: { tenantId }, value: JSON.stringify([provider]) },
    { key: 'builder.storage.activeProvider', options: { tenantId }, value: provider.id },
  ])
}
