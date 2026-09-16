import UIKit

enum PhotoDetailReactionGeometry {
  static let restDiameter: CGFloat = 36
  static let peakDiameter: CGFloat = 48
  static let spacing: CGFloat = 10
  static let lift: CGFloat = 12
  static let sigmaFactor: CGFloat = 1.2
  // Entering the stream locks the target, so the bar stops offering five things
  // it will ignore and becomes the one button it actually is.
  static let collapsedDiameter: CGFloat = 56
  static let collapsedEmojiDiameter: CGFloat = 40
  static let collapsedOthersScale: CGFloat = 0.42
  static let containerInset = UIEdgeInsets(top: 5, left: 5, bottom: 3, right: 5)
  static let overheadForCount: CGFloat = 22
  static let streamShotsToPeak = 20
  static let comboCap = 50

  static var pitch: CGFloat { restDiameter + spacing }

  static var amplitude: CGFloat { peakDiameter / restDiameter - 1 }

  static var containerHeight: CGFloat {
    restDiameter + containerInset.top + containerInset.bottom
  }

  // The magnified item escapes the glass bar upward, so the rail view reserves
  // room above it for the peak overshoot, the lift, and the count label.
  static var railHeight: CGFloat {
    containerHeight + (peakDiameter - restDiameter) / 2 + lift + overheadForCount
  }

  static func containerWidth(itemCount: Int) -> CGFloat {
    guard itemCount > 0 else { return containerInset.left + containerInset.right }
    return CGFloat(itemCount) * restDiameter
      + CGFloat(itemCount - 1) * spacing
      + containerInset.left
      + containerInset.right
  }

  static func expandedContainerRect(in bounds: CGRect) -> CGRect {
    CGRect(
      x: 0,
      y: bounds.height - containerHeight,
      width: bounds.width,
      height: containerHeight
    )
  }

  // Anchored on the pressed item and pinned to the bar's own bottom edge, so it
  // grows upward and never creeps toward the toolbar.
  static func collapsedContainerRect(in bounds: CGRect, focusedIndex: Int) -> CGRect {
    CGRect(
      x: restCenterX(index: focusedIndex) - collapsedDiameter / 2,
      y: bounds.height - collapsedDiameter,
      width: collapsedDiameter,
      height: collapsedDiameter
    )
  }

  static func magnification(distance: CGFloat) -> CGFloat {
    let t = distance / (sigmaFactor * pitch)
    return 1 + amplitude * exp(-t * t)
  }

  static func restCenterX(index: Int) -> CGFloat {
    containerInset.left + restDiameter / 2 + CGFloat(index) * pitch
  }

  static func index(atX x: CGFloat, itemCount: Int) -> Int {
    guard itemCount > 0 else { return 0 }
    let raw = (x - containerInset.left) / pitch
    return min(max(Int(raw.rounded(.down)), 0), itemCount - 1)
  }

  // Ramps 0 → 1 across the first `streamShotsToPeak` shots so haptic intensity
  // and particle energy climb together, then holds.
  static func streamProgress(shotIndex: Int) -> CGFloat {
    guard streamShotsToPeak > 1 else { return 1 }
    let ratio = CGFloat(shotIndex) / CGFloat(streamShotsToPeak - 1)
    return min(max(ratio, 0), 1)
  }
}
