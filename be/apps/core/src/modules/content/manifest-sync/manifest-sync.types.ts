import type { PhotoManifestItem } from '@afilmory/builder'
import type { ManifestChangeOperation, ManifestChangePayload } from '@afilmory/db'

export type PhotoChangeAsset = NonNullable<ManifestChangePayload['asset']>

export interface PhotoChange {
  tenantId: string
  revision: number
  operation: ManifestChangeOperation
  photoId: string
  assetId: string | null
  published: boolean
  photo: PhotoManifestItem | null
  asset: PhotoChangeAsset | null
}

export interface ManifestSnapshotResponse {
  revision: number
  manifest: {
    version: string
    data: PhotoManifestItem[]
    cameras: unknown[]
    lenses: unknown[]
  }
}

export interface ManifestChangesResponse {
  revision: number
  expired: boolean
  changes: PhotoChange[]
}

export const MANIFEST_CHANGE_RETENTION = 10_000
export const MANIFEST_CHANGE_PAGE_SIZE = 500
export const MANIFEST_REVISION_HEADER = 'x-manifest-revision'

export function isChangeCursorExpired(after: number, oldestRevision: number | null): boolean {
  if (after <= 0) {
    return false
  }
  if (oldestRevision == null) {
    return true
  }
  return after < oldestRevision - 1
}

export function revisionETag(revision: number): string {
  return `"rev-${revision}"`
}

const REVISION_ETAG_PATTERN = /^"rev-(\d+)"$/

export function parseRevisionETag(etag: string | null | undefined): number | null {
  if (!etag) {
    return null
  }
  const match = etag.trim().match(REVISION_ETAG_PATTERN)
  if (!match) {
    return null
  }
  return Number(match[1])
}

export function isPublishedSyncStatus(status: string): boolean {
  return status === 'synced' || status === 'conflict'
}

export function toPhotoChange(input: {
  tenantId: string
  revision: number
  payload: ManifestChangePayload
}): PhotoChange {
  return {
    tenantId: input.tenantId,
    revision: input.revision,
    operation: input.payload.operation,
    photoId: input.payload.photoId,
    assetId: input.payload.assetId,
    published: input.payload.published,
    photo: input.payload.photo,
    asset: input.payload.asset,
  }
}
