import UIKit

final class PhotoDetailInspectorPresenter: NSObject, UIGestureRecognizerDelegate {
  var canPresent: (() -> Bool)?
  var onGestureBegan: (() -> Void)?
  var onProgressChange: ((CGFloat) -> Void)?

  private static let compactInspectorHeightRatio: CGFloat = 0.46
  private static let compactInspectorMaximumHeight: CGFloat = 520
  private static let compactInspectorMinimumHeight: CGFloat = 300
  private static let sideInspectorMinimumWidth: CGFloat = 900
  private static let sideInspectorWidth: CGFloat = 380

  private(set) var progress: CGFloat = 0

  private unowned let host: UIView
  private unowned let infoView: PhotoDetailInfoView
  private unowned let mediaViewport: UIView
  private unowned let viewer: PhotoViewerView

  private var animator: UIViewPropertyAnimator?
  private var gestureStartProgress: CGFloat = 0

  private(set) lazy var panGestureRecognizer: UIPanGestureRecognizer = {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handleInfoPan(_:)))
    recognizer.cancelsTouchesInView = false
    recognizer.delegate = self
    recognizer.maximumNumberOfTouches = 1
    return recognizer
  }()

  init(host: UIView, mediaViewport: UIView, viewer: PhotoViewerView, infoView: PhotoDetailInfoView) {
    self.host = host
    self.mediaViewport = mediaViewport
    self.viewer = viewer
    self.infoView = infoView
    super.init()
  }

  func reapplyProgress() {
    apply(progress)
  }

  func settle(open: Bool, velocity: CGFloat) {
    stopAnimationAtCurrentPosition()
    let target: CGFloat = open ? 1 : 0
    guard abs(target - progress) > 0.001 else {
      apply(target)
      return
    }

    guard !UIAccessibility.isReduceMotionEnabled else {
      apply(target)
      if open {
        UIAccessibility.post(notification: .screenChanged, argument: infoView)
      }
      return
    }

    let remainingTranslation: CGFloat
    if usesSideInspector {
      remainingTranslation = sideInspectorWidth * (progress - target)
    } else {
      remainingTranslation = compactInspectorHeight * (progress - target)
    }
    let normalizedVelocity = remainingTranslation == 0
      ? 0
      : min(max(velocity / remainingTranslation, -12), 12)
    let timing = UISpringTimingParameters(
      dampingRatio: 0.88,
      initialVelocity: usesSideInspector
        ? CGVector(dx: normalizedVelocity, dy: 0)
        : CGVector(dx: 0, dy: normalizedVelocity)
    )
    let animator = UIViewPropertyAnimator(duration: 0.5, timingParameters: timing)
    animator.isInterruptible = true
    animator.addAnimations { [weak self] in
      self?.apply(target)
    }
    animator.addCompletion { [weak self] position in
      guard let self else { return }
      self.animator = nil
      guard position == .end else { return }
      apply(target)
      if open {
        UIAccessibility.post(notification: .screenChanged, argument: infoView)
      }
    }
    self.animator = animator
    animator.startAnimation()
  }

  func stopAnimationAtCurrentPosition() {
    guard let animator else { return }
    let progress = currentVisualProgress()
    animator.stopAnimation(true)
    self.animator = nil
    apply(progress)
  }

  private var usesSideInspector: Bool {
    host.bounds.width >= Self.sideInspectorMinimumWidth
  }

  private var compactInspectorHeight: CGFloat {
    min(
      max(host.bounds.height * Self.compactInspectorHeightRatio, Self.compactInspectorMinimumHeight),
      Self.compactInspectorMaximumHeight
    )
  }

  private var sideInspectorWidth: CGFloat {
    min(Self.sideInspectorWidth, host.bounds.width * 0.48)
  }

  private func apply(_ rawProgress: CGFloat) {
    let progress = min(max(rawProgress, 0), 1)
    self.progress = progress
    viewer.infoPresented = progress > 0.001

    if usesSideInspector {
      applySideProgress(progress)
    } else {
      applyCompactProgress(progress)
    }
    onProgressChange?(progress)
  }

  private func applyCompactProgress(_ progress: CGFloat) {
    mediaViewport.frame = host.bounds
    setBaseFrame(viewer, mediaViewport.bounds)

    let panelHeight = compactInspectorHeight
    setBaseFrame(
      infoView,
      CGRect(x: 0, y: host.bounds.height - panelHeight, width: host.bounds.width, height: panelHeight)
    )
    infoView.transform = CGAffineTransform(translationX: 0, y: panelHeight * (1 - progress))

    let mediaBottomInset = viewer.mediaBottomInset(in: mediaViewport.bounds.size)
    let mediaTranslation = mediaBottomInset - panelHeight
    viewer.transform = CGAffineTransform(translationX: 0, y: mediaTranslation * progress)
  }

  private func applySideProgress(_ progress: CGFloat) {
    let inspectorWidth = sideInspectorWidth
    let mediaWidth = host.bounds.width - inspectorWidth * progress
    mediaViewport.frame = CGRect(x: 0, y: 0, width: mediaWidth, height: host.bounds.height)
    viewer.transform = .identity
    setBaseFrame(viewer, mediaViewport.bounds)

    setBaseFrame(
      infoView,
      CGRect(x: host.bounds.width - inspectorWidth, y: 0, width: inspectorWidth, height: host.bounds.height)
    )
    infoView.transform = CGAffineTransform(translationX: inspectorWidth * (1 - progress), y: 0)
  }

  private func setBaseFrame(_ view: UIView, _ frame: CGRect) {
    view.bounds = CGRect(origin: .zero, size: frame.size)
    view.center = CGPoint(x: frame.midX, y: frame.midY)
  }

  private func currentVisualProgress() -> CGFloat {
    guard let presentation = infoView.layer.presentation() else { return progress }
    let translationKey = usesSideInspector ? "transform.translation.x" : "transform.translation.y"
    guard let value = presentation.value(forKeyPath: translationKey) as? NSNumber else {
      return progress
    }
    let translation = CGFloat(truncating: value)
    let distance = usesSideInspector ? sideInspectorWidth : compactInspectorHeight
    guard distance > 0 else { return progress }
    return min(max(1 - translation / distance, 0), 1)
  }

  @objc private func handleInfoPan(_ gesture: UIPanGestureRecognizer) {
    let translation = gesture.translation(in: host).y
    let velocity = gesture.velocity(in: host).y
    let distance = max(compactInspectorHeight, 1)

    switch gesture.state {
    case .began:
      stopAnimationAtCurrentPosition()
      gestureStartProgress = progress
      onGestureBegan?()
    case .changed:
      apply(gestureStartProgress - translation / distance)
    case .ended:
      let progress = min(max(gestureStartProgress - translation / distance, 0), 1)
      apply(progress)
      let projectedProgress = progress - velocity / distance * 0.12
      settle(open: projectedProgress >= 0.5, velocity: velocity)
    case .cancelled, .failed:
      settle(open: progress >= 0.5, velocity: 0)
    default:
      break
    }
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === panGestureRecognizer else { return true }
    guard !usesSideInspector,
          canPresent?() ?? false,
          viewer.allowsInfoGesture()
    else {
      return false
    }

    let translation = panGestureRecognizer.translation(in: host)
    let velocity = panGestureRecognizer.velocity(in: host)
    let direction = abs(translation.x) + abs(translation.y) > 0.5 ? translation : velocity
    guard abs(direction.y) > abs(direction.x) * 1.12 else { return false }

    if progress <= 0.001 {
      return direction.y < 0
    }
    if progress >= 0.999 {
      guard direction.y > 0 else { return false }
      let point = panGestureRecognizer.location(in: host)
      if infoView.frame.contains(point), let scrollView = scrollView(at: point) {
        let top = -scrollView.adjustedContentInset.top
        return scrollView.contentOffset.y <= top + 1
      }
    }
    return true
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    gestureRecognizer === panGestureRecognizer || otherGestureRecognizer === panGestureRecognizer
  }

  private func scrollView(at point: CGPoint) -> UIScrollView? {
    var candidate = host.hitTest(point, with: nil)
    while let view = candidate, view !== host {
      if let scrollView = view as? UIScrollView {
        return scrollView
      }
      candidate = view.superview
    }
    return nil
  }
}
