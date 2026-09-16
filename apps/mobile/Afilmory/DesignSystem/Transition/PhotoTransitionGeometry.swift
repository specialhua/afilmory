import CoreGraphics

struct PhotoTransitionTransform: Equatable, Sendable {
  let scale: CGFloat
  let translation: CGPoint

  var affineTransform: CGAffineTransform {
    CGAffineTransform(translationX: translation.x, y: translation.y)
      .scaledBy(x: scale, y: scale)
  }
}

struct PhotoTransitionTarget: Equatable, Sendable {
  let imageFrame: CGRect
  let targetRect: CGRect
  let targetCornerRadius: CGFloat
}

struct PhotoDismissDragState: Equatable, Sendable {
  let progress: CGFloat
  let transform: PhotoTransitionTransform
}

enum PhotoTransitionGeometry {
  static let dismissCommitProgress: CGFloat = 0.45
  static let dismissCommitVelocity: CGFloat = 1_200
  static let dismissCommitMinimumTranslation: CGFloat = 100

  static func dismissalDragState(
    translation: CGPoint,
    origin: PhotoTransitionTransform = PhotoTransitionTransform(
      scale: 1,
      translation: .zero
    ),
    distance: CGFloat = 340,
    minimumScale: CGFloat = 0.68
  ) -> PhotoDismissDragState {
    let translationY = translation.y > 0 ? translation.y : translation.y / 3
    let resolvedTranslation = CGPoint(
      x: origin.translation.x + translation.x,
      y: origin.translation.y + translationY
    )
    let progress = min(max(resolvedTranslation.y / max(distance, 1), 0), 1)
    let scale = 1 - (1 - minimumScale) * progress
    return PhotoDismissDragState(
      progress: progress,
      transform: PhotoTransitionTransform(
        scale: scale,
        translation: resolvedTranslation
      )
    )
  }

  static func dismissalPinchState(
    scale: CGFloat,
    anchor: CGPoint,
    location: CGPoint,
    viewportCenter: CGPoint,
    distance: CGFloat = 340,
    commitScale: CGFloat = 0.68,
    minimumScale: CGFloat = 0.48
  ) -> PhotoDismissDragState {
    let resolvedScale = min(max(scale, minimumScale), 1)
    let centroidTranslation = CGPoint(
      x: location.x - anchor.x,
      y: location.y - anchor.y
    )
    let anchorOffset = CGPoint(
      x: anchor.x - viewportCenter.x,
      y: anchor.y - viewportCenter.y
    )
    let resolvedTranslation = CGPoint(
      x: centroidTranslation.x + (1 - resolvedScale) * anchorOffset.x,
      y: centroidTranslation.y + (1 - resolvedScale) * anchorOffset.y
    )
    let scaleDistance = max(1 - commitScale, 0.01)
    let scaleProgress = (1 - resolvedScale) / scaleDistance
    let translationProgress = max(resolvedTranslation.y, 0) / max(distance, 1)
    let progress = min(max(max(scaleProgress, translationProgress), 0), 1)
    return PhotoDismissDragState(
      progress: progress,
      transform: PhotoTransitionTransform(
        scale: resolvedScale,
        translation: resolvedTranslation
      )
    )
  }

  static func shouldCommitDragDismissal(
    progress: CGFloat,
    translationY: CGFloat,
    velocityY: CGFloat
  ) -> Bool {
    progress > dismissCommitProgress
      || (velocityY > dismissCommitVelocity
        && translationY > dismissCommitMinimumTranslation)
  }

  static func shouldCommitPinchDismissal(
    progress: CGFloat,
    scale: CGFloat,
    velocity: CGFloat
  ) -> Bool {
    progress > dismissCommitProgress
      || (velocity < -1.25 && scale < 0.92)
  }

  static func viewportTransform(
    imageFrame: CGRect,
    targetRect: CGRect,
    viewportBounds: CGRect,
    viewportCenter: CGPoint
  ) -> PhotoTransitionTransform? {
    guard imageFrame.width > 0,
          imageFrame.height > 0,
          targetRect.width > 0,
          targetRect.height > 0
    else { return nil }
    let scale = max(targetRect.width / imageFrame.width, targetRect.height / imageFrame.height)
    let boundsCenter = CGPoint(x: viewportBounds.midX, y: viewportBounds.midY)
    let imageOffset = CGPoint(
      x: imageFrame.midX - boundsCenter.x,
      y: imageFrame.midY - boundsCenter.y
    )
    let translation = CGPoint(
      x: targetRect.midX - viewportCenter.x - scale * imageOffset.x,
      y: targetRect.midY - viewportCenter.y - scale * imageOffset.y
    )
    return PhotoTransitionTransform(scale: scale, translation: translation)
  }

  static func aspectFillContentsRect(
    imageSize: CGSize,
    viewportSize: CGSize
  ) -> CGRect? {
    guard imageSize.width > 0,
          imageSize.height > 0,
          viewportSize.width > 0,
          viewportSize.height > 0
    else { return nil }
    let scale = max(
      viewportSize.width / imageSize.width,
      viewportSize.height / imageSize.height
    )
    let visibleWidth = min(1, viewportSize.width / (imageSize.width * scale))
    let visibleHeight = min(1, viewportSize.height / (imageSize.height * scale))
    return CGRect(
      x: (1 - visibleWidth) / 2,
      y: (1 - visibleHeight) / 2,
      width: visibleWidth,
      height: visibleHeight
    )
  }

  static func aspectFitRect(aspectRatio: CGFloat, in bounds: CGRect) -> CGRect? {
    guard aspectRatio > 0, bounds.width > 0, bounds.height > 0 else { return nil }
    let width = min(bounds.width, bounds.height * aspectRatio)
    let height = width / aspectRatio
    return CGRect(
      x: bounds.midX - width / 2,
      y: bounds.midY - height / 2,
      width: width,
      height: height
    )
  }

  static func transformedRect(
    _ rect: CGRect,
    by transform: PhotoTransitionTransform,
    around center: CGPoint
  ) -> CGRect {
    rect
      .offsetBy(dx: -center.x, dy: -center.y)
      .applying(transform.affineTransform)
      .offsetBy(dx: center.x, dy: center.y)
  }
}
