import { StorageFactory } from '@afilmory/builder/storage/index.js'
import type {
  ManagedStorageConfig,
  ProgressCallback,
  RemoteStorageConfig,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from '@afilmory/builder/storage/interfaces.js'

import { joinSegments, normalizePath } from '../../content/photo/storage/storage.utils'

type PrefixedStorageObject = StorageObject & { key: string }

export class ManagedStorageProvider implements StorageProvider {
  private readonly upstream: StorageProvider

  private readonly effectivePrefix: string
  private readonly needsManualPrefix: boolean

  constructor(private readonly config: ManagedStorageConfig) {
    const tenantSegment = normalizePath(config.tenantId)
    if (!tenantSegment) {
      throw new Error('Managed storage provider requires a valid tenantId.')
    }

    const upstreamBase = normalizePath(this.extractUpstreamBasePath(config.upstream))
    const customBase = normalizePath(config.basePrefix)
    const combinedBase = joinSegments(upstreamBase, customBase)
    this.effectivePrefix = joinSegments(combinedBase, tenantSegment)

    const scopedConfig = this.applyTenantPrefix(config.upstream, this.effectivePrefix)

    this.needsManualPrefix =
      scopedConfig.provider === 's3' || scopedConfig.provider === 'oss' || scopedConfig.provider === 'cos'
    this.upstream = StorageFactory.createProvider(scopedConfig)
  }

  async getFile(key: string): Promise<Buffer | null> {
    const targetKey = this.prepareKeyForUpstream(key)
    return await this.upstream.getFile(targetKey)
  }

  async listImages(): Promise<StorageObject[]> {
    const objects = await this.upstream.listImages()
    return this.normalizeResults(objects)
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const objects = await this.upstream.listAllFiles(progressCallback)
    return this.normalizeResults(objects)
  }

  async generatePublicUrl(key: string): Promise<string> {
    const targetKey = this.prepareKeyForUpstream(key)
    return await this.upstream.generatePublicUrl(targetKey)
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    const upstreamObjects = this.toUpstreamObjects(allObjects)
    const liveMap = this.upstream.detectLivePhotos(upstreamObjects)
    const result = new Map<string, StorageObject>()

    for (const [key, value] of liveMap.entries()) {
      const normalizedKey = this.stripEffectivePrefix(key)
      if (!normalizedKey) {
        continue
      }
      const normalizedValue: StorageObject = value?.key
        ? { ...value, key: this.stripEffectivePrefix(value.key) }
        : value
      result.set(normalizedKey, normalizedValue)
    }

    return result
  }

  async deleteFile(key: string): Promise<void> {
    const targetKey = this.prepareKeyForUpstream(key)
    await this.upstream.deleteFile(targetKey)
  }

  async deleteFolder(prefix: string): Promise<void> {
    const normalizedPrefix = normalizePath(prefix)
    const targetPrefix =
      this.needsManualPrefix && !normalizedPrefix ? this.effectivePrefix : this.prepareKeyForUpstream(normalizedPrefix)
    await this.upstream.deleteFolder(targetPrefix)
  }

  async uploadFile(key: string, data: Buffer, options?: StorageUploadOptions): Promise<StorageObject> {
    const targetKey = this.prepareKeyForUpstream(key)
    const uploaded = await this.upstream.uploadFile(targetKey, data, options)
    return this.normalizeResult(uploaded)
  }

  async moveFile(sourceKey: string, targetKey: string, options?: StorageUploadOptions): Promise<StorageObject> {
    const source = this.prepareKeyForUpstream(sourceKey)
    const target = this.prepareKeyForUpstream(targetKey)
    const moved = await this.upstream.moveFile(source, target, options)
    return this.normalizeResult(moved)
  }

  private prepareKeyForUpstream(key: string): string {
    const normalizedKey = normalizePath(key) || ''
    if (!this.needsManualPrefix) {
      return normalizedKey
    }

    return joinSegments(this.effectivePrefix, normalizedKey)
  }

  private toUpstreamObjects(objects: StorageObject[]): PrefixedStorageObject[] {
    return objects
      .map((obj) => {
        if (!obj.key) {
          return null
        }
        const upstreamKey = this.prepareKeyForUpstream(obj.key)
        return { ...obj, key: upstreamKey }
      })
      .filter((obj): obj is PrefixedStorageObject => obj !== null)
  }

  private normalizeResult<T extends StorageObject>(object: T): T {
    if (!object.key) {
      return object
    }
    const normalizedKey = this.stripEffectivePrefix(object.key)
    return { ...object, key: normalizedKey } as T
  }

  private normalizeResults(objects: StorageObject[]): StorageObject[] {
    return objects
      .map((obj) => {
        if (!obj.key) {
          return null
        }
        return this.normalizeResult(obj)
      })
      .filter((obj): obj is StorageObject => obj !== null)
  }

  private stripEffectivePrefix(rawKey: string): string {
    const normalizedKey = normalizePath(rawKey) || ''
    if (!this.effectivePrefix) {
      return normalizedKey
    }

    if (normalizedKey === this.effectivePrefix) {
      return ''
    }

    const prefixWithSlash = `${this.effectivePrefix}/`
    if (normalizedKey.startsWith(prefixWithSlash)) {
      return normalizedKey.slice(prefixWithSlash.length)
    }

    return normalizedKey
  }

  private extractUpstreamBasePath(config: RemoteStorageConfig): string | null {
    switch (config.provider) {
      case 's3':
      case 'oss':
      case 'cos':
      case 'b2': {
        const normalized = normalizePath(config.prefix)
        return normalized || null
      }
      case 'github': {
        const normalized = normalizePath(config.path)
        return normalized || null
      }
      default: {
        return null
      }
    }
  }

  private applyTenantPrefix(config: RemoteStorageConfig, prefix: string): RemoteStorageConfig {
    const normalizedPrefix = normalizePath(prefix) || null
    if (!normalizedPrefix) {
      return config
    }

    switch (config.provider) {
      case 's3':
      case 'oss':
      case 'cos': {
        return { ...config, prefix: normalizedPrefix }
      }
      case 'b2': {
        return { ...config, prefix: normalizedPrefix }
      }
      case 'github': {
        return { ...config, path: normalizedPrefix }
      }
      default: {
        return config
      }
    }
  }
}

export function registerManagedStorageProvider(): void {
  StorageFactory.registerProvider('managed', (config) => new ManagedStorageProvider(config as ManagedStorageConfig), {
    category: 'remote',
  })
}
