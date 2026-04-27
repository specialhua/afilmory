interface ResolvePhotoViewerEntryStateParams {
  hasTransitionTrigger: boolean
  isCurrentImageVisualReady: boolean
  isEntryTransitionActive: boolean
  isOpen: boolean
  isViewerContentVisible: boolean
}

interface ResolvePhotoViewerEntryStateResult {
  shouldMountImageStage: boolean
  shouldShowEntryImageCatchup: boolean
}

interface ProgressiveImageVisualReadyParams {
  isHighResImageRendered: boolean
  isThumbnailLoaded: boolean
  thumbnailSrc?: string
}

interface ThumbnailElementVisualReadyParams {
  currentSrc?: string
  naturalWidth?: number
  src?: string
  thumbnailSrc?: string
}

interface ShouldHideCurrentViewerImageParams {
  isCurrentImage: boolean
  isEntryImageCatchupVisible: boolean
}

export const resolvePhotoViewerEntryState = ({
  hasTransitionTrigger,
  isCurrentImageVisualReady,
  isEntryTransitionActive,
  isOpen,
  isViewerContentVisible,
}: ResolvePhotoViewerEntryStateParams): ResolvePhotoViewerEntryStateResult => {
  const shouldMountImageStage = isOpen && (isViewerContentVisible || !hasTransitionTrigger)
  const shouldShowEntryImageCatchup = Boolean(
    isOpen && hasTransitionTrigger && isViewerContentVisible && (isEntryTransitionActive || !isCurrentImageVisualReady),
  )

  return {
    shouldMountImageStage,
    shouldShowEntryImageCatchup,
  }
}

export const getProgressiveImageVisualReady = ({
  isHighResImageRendered,
  isThumbnailLoaded,
  thumbnailSrc,
}: ProgressiveImageVisualReadyParams) => {
  return Boolean((thumbnailSrc && isThumbnailLoaded) || isHighResImageRendered)
}

export const isThumbnailElementVisuallyReady = ({
  currentSrc,
  naturalWidth,
  src,
  thumbnailSrc,
}: ThumbnailElementVisualReadyParams) => {
  if (!thumbnailSrc || !naturalWidth || naturalWidth <= 0) {
    return false
  }

  return Boolean((currentSrc && currentSrc.includes(thumbnailSrc)) || src === thumbnailSrc)
}

export const shouldHideCurrentViewerImage = ({
  isCurrentImage,
  isEntryImageCatchupVisible,
}: ShouldHideCurrentViewerImageParams) => {
  return Boolean(isCurrentImage && isEntryImageCatchupVisible)
}
