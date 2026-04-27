import type {
  AnimationFrameRect,
  ViewerFrameLayout,
  ViewerFrameTransformSnapshot,
  ViewerTransitionItem,
  ViewerTransitionVariant,
  ViewportRectLike,
} from './types'

export const DEFAULT_DESKTOP_VIEWER_MEDIA_TRANSFORM_ORIGIN = '50% 50%'
export const DEFAULT_MOBILE_VIEWER_MEDIA_TRANSFORM_ORIGIN = '50% 18%'
export const DEFAULT_MOBILE_VIEWER_MEDIA_ORIGIN_Y_RATIO = 0.18

export const DEFAULT_VIEWER_FRAME_LAYOUT: Required<ViewerFrameLayout> = {
  desktopSidebarWidthRem: 0,
  desktopThumbnailStripHeight: 0,
  mobileThumbnailStripHeight: 0,
}

const FALLBACK_VIEWPORT = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
}

const getRootFontSize = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 16
  }

  const value = window.getComputedStyle(document.documentElement).fontSize
  const parsed = Number.parseFloat(value || '16')
  return Number.isNaN(parsed) ? 16 : parsed
}

const getViewportRect = (viewportRect?: ViewportRectLike | null): ViewportRectLike => {
  if (viewportRect) {
    return viewportRect
  }

  if (typeof window === 'undefined') {
    return FALLBACK_VIEWPORT
  }

  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

export const escapeAttributeValue = (value: string) => {
  const cssEscape = typeof window !== 'undefined' ? window.CSS?.escape : undefined

  if (cssEscape) {
    return cssEscape(value)
  }

  return value.replaceAll(/['\\]/g, '\\$&')
}

export const getBorderRadius = (element: Element | null) => {
  if (!element || typeof window === 'undefined') return 0

  const computedStyle = window.getComputedStyle(element)
  const radiusCandidates = [
    computedStyle.borderRadius,
    computedStyle.borderTopLeftRadius,
    computedStyle.borderTopRightRadius,
  ].filter((value) => value && value !== '0px')

  if (radiusCandidates.length === 0) return 0

  const parsed = Number.parseFloat(radiusCandidates[0] || '0')
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, parsed)
}

export const computeViewerMediaFrame = (
  item: Pick<ViewerTransitionItem, 'width' | 'height'>,
  viewportRect: ViewportRectLike | null,
  isMobile: boolean,
  layout: ViewerFrameLayout = {},
): AnimationFrameRect => {
  const resolvedLayout = { ...DEFAULT_VIEWER_FRAME_LAYOUT, ...layout }
  const rect = getViewportRect(viewportRect)
  const baseFontSize = getRootFontSize()
  const sidebarWidth = isMobile ? 0 : resolvedLayout.desktopSidebarWidthRem * baseFontSize
  const thumbnailStripHeight = isMobile
    ? resolvedLayout.mobileThumbnailStripHeight
    : resolvedLayout.desktopThumbnailStripHeight

  const contentWidth = Math.max(0, rect.width - sidebarWidth)
  const contentHeight = Math.max(0, rect.height - thumbnailStripHeight)

  const mediaWidth = item.width || contentWidth
  const mediaHeight = item.height || contentHeight || 1
  const aspectRatio = mediaWidth > 0 && mediaHeight > 0 ? mediaWidth / mediaHeight : 1

  let displayWidth = contentWidth
  let displayHeight = aspectRatio > 0 ? contentWidth / aspectRatio : contentHeight

  if (displayHeight > contentHeight) {
    displayHeight = contentHeight
    displayWidth = contentHeight * aspectRatio
  }

  const left = rect.left + (contentWidth - displayWidth) / 2
  const top = rect.top + (contentHeight - displayHeight) / 2

  return {
    left,
    top,
    width: displayWidth,
    height: displayHeight,
    borderRadius: 0,
    rotate: 0,
    transformOrigin: isMobile
      ? DEFAULT_MOBILE_VIEWER_MEDIA_TRANSFORM_ORIGIN
      : DEFAULT_DESKTOP_VIEWER_MEDIA_TRANSFORM_ORIGIN,
  }
}

export const projectViewerMediaFrame = (
  frame: AnimationFrameRect,
  viewportRect: ViewportRectLike,
  snapshot: ViewerFrameTransformSnapshot,
): AnimationFrameRect => {
  const originX = viewportRect.left + viewportRect.width * 0.5
  const originY = viewportRect.top + viewportRect.height * DEFAULT_MOBILE_VIEWER_MEDIA_ORIGIN_Y_RATIO

  return {
    left: originX + (frame.left - originX) * snapshot.scale + snapshot.translateX,
    top: originY + (frame.top - originY) * snapshot.scale + snapshot.translateY,
    width: frame.width * snapshot.scale,
    height: frame.height * snapshot.scale,
    borderRadius: snapshot.borderRadius,
    rotate: snapshot.rotate,
    transformOrigin: frame.transformOrigin,
  }
}

interface ProjectDismissedViewerMediaFrameParams {
  item: Pick<ViewerTransitionItem, 'width' | 'height'>
  isMobile: boolean
  layout?: ViewerFrameLayout
  snapshot: ViewerFrameTransformSnapshot
  viewportRect: ViewportRectLike | null
}

export const projectDismissedViewerMediaFrame = ({
  item,
  isMobile,
  layout,
  snapshot,
  viewportRect,
}: ProjectDismissedViewerMediaFrameParams): AnimationFrameRect => {
  const resolvedViewportRect = getViewportRect(viewportRect)
  const baseFrame = computeViewerMediaFrame(item, resolvedViewportRect, isMobile, layout)

  return projectViewerMediaFrame(baseFrame, resolvedViewportRect, snapshot)
}

export const resolveViewerTransitionImageSrc = (
  item: Pick<ViewerTransitionItem, 'previewSrc' | 'fullSrc'>,
  currentDisplaySrc: string | null | undefined,
  variant: ViewerTransitionVariant,
) => {
  if (variant === 'entry') {
    return currentDisplaySrc || item.previewSrc || item.fullSrc || null
  }

  return item.previewSrc || currentDisplaySrc || item.fullSrc || null
}
