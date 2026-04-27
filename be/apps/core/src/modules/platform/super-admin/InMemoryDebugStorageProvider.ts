import { randomUUID } from 'node:crypto'

import type {
  BuilderConfig,
  PhotoManifestItem,
  ProgressCallback,
  StorageConfig,
  StorageManager,
  StorageObject,
  StorageProvider,
} from '@afilmory/builder'
import type { StorageUploadOptions } from '@afilmory/builder/storage/interfaces.js'
import type { PhotoBuilderService } from '@core/modules/content/photo/builder/photo-builder.service'
import type { DataSyncLogPayload } from '@core/modules/infrastructure/data-sync/data-sync.types'

type BuilderDebugResultType = 'new' | 'processed' | 'skipped' | 'failed'
export type BuilderDebugProgressEvent =
  | {
      type: 'start'
      payload: {
        storageKey: string
        filename: string
        contentType: string | null
        size: number
      }
    }
  | {
      type: 'log'
      payload: DataSyncLogPayload
    }
  | {
      type: 'complete'
      payload: {
        storageKey: string
        resultType: BuilderDebugResultType
        manifestItem: PhotoManifestItem | null
        thumbnailUrl?: string | null
        filesDeleted: boolean
      }
    }
  | {
      type: 'error'
      payload: {
        message: string
      }
    }
export type UploadedDebugFile = {
  name: string
  size: number
  contentType: string | null
  buffer: Buffer
}
export type StorageResolution = {
  builder: ReturnType<PhotoBuilderService['createBuilder']>
  builderConfig: BuilderConfig
  storageConfig: StorageConfig
  storageManager: StorageManager
}
export class InMemoryDebugStorageProvider implements StorageProvider {
  private readonly files = new Map<
    string,
    {
      buffer: Buffer
      metadata: StorageObject
    }
  >()

  async getFile(key: string): Promise<Buffer | null> {
    return this.files.get(key)?.buffer ?? null
  }

  async listImages(): Promise<StorageObject[]> {
    return Array.from(this.files.values()).map((entry) => entry.metadata)
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const files = await this.listImages()
    if (progressCallback) {
      progressCallback({
        currentPath: '',
        filesScanned: files.length,
        totalFiles: files.length,
      })
    }
    return files
  }

  generatePublicUrl(key: string): string {
    return `debug://${encodeURIComponent(key)}`
  }

  detectLivePhotos(_allObjects: StorageObject[]): Map<string, StorageObject> {
    return new Map()
  }

  async deleteFile(key: string): Promise<void> {
    this.files.delete(key)
  }

  async deleteFolder(prefix: string): Promise<void> {
    const normalizedPrefix = this.normalizeKey(prefix)
    const prefixWithSlash = normalizedPrefix ? `${normalizedPrefix}/` : null

    if (!normalizedPrefix) {
      this.files.clear()
      return
    }

    for (const key of this.files.keys()) {
      if (key === normalizedPrefix || (prefixWithSlash && key.startsWith(prefixWithSlash))) {
        this.files.delete(key)
      }
    }
  }

  async uploadFile(key: string, data: Buffer, _options?: StorageUploadOptions): Promise<StorageObject> {
    const normalizedKey = this.normalizeKey(key)
    const metadata: StorageObject = {
      key: normalizedKey,
      size: data.length,
      lastModified: new Date(),
      etag: randomUUID(),
    }

    this.files.set(normalizedKey, {
      buffer: data,
      metadata,
    })

    return metadata
  }

  async moveFile(sourceKey: string, targetKey: string, _options?: StorageUploadOptions): Promise<StorageObject> {
    const normalizedSource = this.normalizeKey(sourceKey)
    const entry = this.files.get(normalizedSource)
    if (!entry) {
      throw new Error(`Debug storage file not found: ${sourceKey}`)
    }

    const normalizedTarget = this.normalizeKey(targetKey)
    const metadata: StorageObject = {
      ...entry.metadata,
      key: normalizedTarget,
      lastModified: new Date(),
      etag: randomUUID(),
    }

    this.files.delete(normalizedSource)
    this.files.set(normalizedTarget, {
      buffer: entry.buffer,
      metadata,
    })

    return metadata
  }

  private normalizeKey(key: string): string {
    return key.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
  }
}
