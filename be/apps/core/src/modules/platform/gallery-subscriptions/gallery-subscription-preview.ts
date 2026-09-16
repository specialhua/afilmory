import type { PhotoManifestItem } from '@afilmory/builder'

import type { GalleryPhotoPreview } from './gallery-subscription-timeline.policy'

export function toGalleryPhotoPreview(input: {
  photoId: string
  syncedAt: string
  manifest: PhotoManifestItem | null | undefined
}): GalleryPhotoPreview | null {
  const thumbnailUrl = input.manifest?.thumbnailUrl?.trim()
  if (!thumbnailUrl) {
    return null
  }
  const width = input.manifest?.width ?? 0
  const height = input.manifest?.height ?? 0
  const aspectRatio = input.manifest?.aspectRatio ?? (width > 0 && height > 0 ? width / height : 1)
  return {
    id: input.photoId,
    thumbnailUrl,
    thumbHash: input.manifest?.thumbHash ?? null,
    width,
    height,
    aspectRatio,
    isLivePhoto: input.manifest?.video?.type === 'live-photo',
    syncedAt: input.syncedAt,
  }
}
