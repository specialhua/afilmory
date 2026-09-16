import CoreGraphics

struct PhotoDetailChromeVisibility {
  var userHidden: Bool
  var infoProgress: CGFloat
  var zoomed: Bool
  var dismissing = false

  private var clampedInfoProgress: CGFloat {
    min(max(infoProgress, 0), 1)
  }

  private var base: CGFloat {
    (userHidden || zoomed || dismissing) ? 0 : 1
  }

  var navBarAlpha: CGFloat { base * (1 - clampedInfoProgress) }
  var toolbarAlpha: CGFloat { base }
  var topScrimAlpha: CGFloat { base * (1 - clampedInfoProgress) }
  var bottomScrimAlpha: CGFloat { base }
  var liveBadgeAlpha: CGFloat { base }
  var loadingPillAlpha: CGFloat { dismissing ? 0 : 1 }
  var statusBarHidden: Bool { userHidden || zoomed }
  var homeIndicatorHidden: Bool { userHidden || zoomed }

  // Keeps userHidden and an open inspector from ever being true together.
  var allowsImmersiveToggle: Bool { clampedInfoProgress < 0.001 }
}
