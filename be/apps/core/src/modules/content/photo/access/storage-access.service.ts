import type { ManagedStorageConfig, S3CompatibleConfig, StorageConfig } from '@afilmory/builder'
import { generateId, photoAccessLogs, photoAccessStats, photoAssets } from '@afilmory/db'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { normalizedBoolean } from '@core/helpers/normalize.helper'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { PhotoStorageService } from '@core/modules/content/photo/storage/photo-storage.service'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { joinSegments, normalizeKeyPath, normalizePath } from './storage-access.utils'

type RemoteAccessTarget = {
  kind: 's3'
  config: S3CompatibleConfig
  objectKey: string
}

type IssueSignedUrlOptions = {
  storageKey: string
  ttlSeconds?: number
  intent?: string
  clientIp?: string | null
  userAgent?: string | null
  referer?: string | null
}

export type IssueSignedUrlResult = {
  url: string
  expiresAt: string
  tokenId: string
  headers: Record<string, string>
}

const DEFAULT_TTL_SECONDS = 600
const MIN_TTL_SECONDS = 60
const MAX_TTL_SECONDS = 600

@injectable()
export class StorageAccessService {
  private readonly logger = logger.extend('StorageAccessService')

  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly photoStorageService: PhotoStorageService,
    private readonly settingService: SettingService,
    private readonly systemSettingService: SystemSettingService,
  ) {}

  async isSecureAccessEnabled(): Promise<boolean> {
    const tenant = requireTenantContext()
    const { storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    return await this.resolveSecureAccessPreference(storageConfig, tenant.tenant.id)
  }

  async resolveSecureAccessPreference(storageConfig: StorageConfig, tenantId: string): Promise<boolean> {
    if (storageConfig.provider === 'managed') {
      return await this.systemSettingService.isManagedStorageSecureAccessEnabled()
    }
    const raw = (await this.settingService.get('photo.storage.secureAccess', { tenantId })) ?? 'false'
    return normalizedBoolean(raw)
  }

  async issueSignedUrl(options: IssueSignedUrlOptions): Promise<IssueSignedUrlResult> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()
    const normalizedKey = normalizeKeyPath(options.storageKey)
    if (!normalizedKey) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少有效的 storage key' })
    }

    const { storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const secureAccessEnabled = await this.resolveSecureAccessPreference(storageConfig, tenant.tenant.id)
    if (!secureAccessEnabled) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Secure access is not enabled.' })
    }
    const target = this.resolveRemoteTarget(storageConfig, normalizedKey, tenant.tenant.id)
    const ttl = this.normalizeTtlSeconds(options.ttlSeconds)
    const { url, expiresAt, headers } = await this.createS3SignedUrl(target.config, target.objectKey, ttl)
    const tokenId = generateId()

    const record = await db
      .select({
        id: photoAssets.id,
        photoId: photoAssets.photoId,
        storageProvider: photoAssets.storageProvider,
      })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), eq(photoAssets.storageKey, normalizedKey)))
      .limit(1)
      .then((rows) => rows[0])

    if (record) {
      const now = new Date().toISOString()

      await db.insert(photoAccessLogs).values({
        id: generateId(),
        tenantId: tenant.tenant.id,
        photoAssetId: record.id,
        photoId: record.photoId,
        storageKey: normalizedKey,
        provider: target.kind,
        intent: options.intent?.trim() || 'original',
        tokenId,
        signedUrl: url,
        status: 'issued',
        clientIp: options.clientIp ?? null,
        userAgent: options.userAgent ?? null,
        referer: options.referer ?? null,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })

      await db
        .insert(photoAccessStats)
        .values({
          tenantId: tenant.tenant.id,
          photoAssetId: record.id,
          photoId: record.photoId,
          viewCount: 1,
          lastViewedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [photoAccessStats.tenantId, photoAccessStats.photoAssetId],
          set: {
            viewCount: sql`${photoAccessStats.viewCount} + 1`,
            lastViewedAt: now,
            updatedAt: now,
            photoId: record.photoId,
          },
        })
    }
    return { url, expiresAt, tokenId, headers }
  }

  private resolveRemoteTarget(config: StorageConfig, key: string, tenantId: string): RemoteAccessTarget {
    switch (config.provider) {
      case 'managed': {
        const managedConfig = config as ManagedStorageConfig
        const managedKey = this.applyManagedPrefix(managedConfig, key)
        return this.resolveRemoteTarget(managedConfig.upstream, managedKey, tenantId)
      }
      case 's3': {
        const s3Config = config as S3CompatibleConfig
        return { kind: 's3', config: s3Config, objectKey: key }
      }

      default: {
        this.logger.error(
          `Storage provider ${config.provider as string} for tenant ${tenantId} does not support secure download URLs.`,
        )
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '当前存储提供商不支持安全访问链接' })
      }
    }
  }

  private applyManagedPrefix(config: ManagedStorageConfig, key: string): string {
    const tenantSegment = normalizePath(config.tenantId)
    const upstreamBase = normalizePath(this.extractUpstreamBasePath(config.upstream))
    const customBase = normalizePath(config.basePrefix)
    const combined = joinSegments(upstreamBase, customBase, tenantSegment)
    return joinSegments(combined, key)
  }

  private extractUpstreamBasePath(config: StorageConfig): string | null {
    switch (config.provider) {
      case 's3':
      case 'oss':
      case 'cos': {
        const s3Config = config as S3CompatibleConfig
        return normalizePath(s3Config.prefix) || null
      }
      case 'b2': {
        return null
      }
      case 'github': {
        const githubConfig = config as { provider: 'github'; path?: string | null }
        return normalizePath(githubConfig.path) || null
      }
      default: {
        return null
      }
    }
  }

  private normalizeTtlSeconds(input?: number): number {
    if (!input || !Number.isFinite(input)) {
      return DEFAULT_TTL_SECONDS
    }
    const normalized = Math.trunc(input)
    if (normalized < MIN_TTL_SECONDS) {
      return MIN_TTL_SECONDS
    }
    if (normalized > MAX_TTL_SECONDS) {
      return MAX_TTL_SECONDS
    }
    return normalized
  }

  private async createS3SignedUrl(
    config: S3CompatibleConfig,
    key: string,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: string; headers: Record<string, string> }> {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'S3 存储配置缺少访问密钥' })
    }
    const s3 = new S3Client({
      region: config.region ?? 'us-east-1',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    })

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })

    const url = await getSignedUrl(s3 as any, command, { expiresIn: ttlSeconds })
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), headers: {} }
  }
}
