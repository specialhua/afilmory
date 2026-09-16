import UIKit

final class PhotoTransitionAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  enum Direction {
    case presenting
    case dismissing
  }

  private let direction: Direction
  private weak var detailController: PhotoDetailViewController?
  private weak var interaction: PhotoTransitionInteraction?
  private var animator: UIViewPropertyAnimator?
  private var backdropAnimator: UIViewPropertyAnimator?
  private var chromeAnimator: UIViewPropertyAnimator?
  private weak var sourceView: UIView?

  init(
    direction: Direction,
    detailController: PhotoDetailViewController,
    interaction: PhotoTransitionInteraction
  ) {
    self.direction = direction
    self.detailController = detailController
    self.interaction = interaction
    super.init()
  }

  func transitionDuration(
    using transitionContext: UIViewControllerContextTransitioning?
  ) -> TimeInterval {
    direction == .presenting ? 0.42 : 0.36
  }

  func animateTransition(using transitionContext: UIViewControllerContextTransitioning) {
    let animator = interruptibleAnimator(using: transitionContext)
    animator.startAnimation()
  }

  func interruptibleAnimator(
    using transitionContext: UIViewControllerContextTransitioning
  ) -> UIViewImplicitlyAnimating {
    if let animator {
      return animator
    }
    let animator = switch direction {
    case .presenting:
      makePresentationAnimator(using: transitionContext)
    case .dismissing:
      makeDismissalAnimator(using: transitionContext)
    }
    self.animator = animator
    return animator
  }

  func animationEnded(_ transitionCompleted: Bool) {
    animator = nil
    backdropAnimator?.stopAnimation(true)
    chromeAnimator?.stopAnimation(true)
    backdropAnimator = nil
    chromeAnimator = nil
    sourceView?.isHidden = false
    sourceView = nil
  }

  func finishPresentationForGeometryChange() {
    guard case .presenting = direction, let animator else { return }
    backdropAnimator?.stopAnimation(false)
    backdropAnimator?.finishAnimation(at: .end)
    chromeAnimator?.stopAnimation(false)
    chromeAnimator?.finishAnimation(at: .end)
    animator.stopAnimation(false)
    animator.finishAnimation(at: .end)
  }

  private func makePresentationAnimator(
    using transitionContext: UIViewControllerContextTransitioning
  ) -> UIViewPropertyAnimator {
    guard let detailController,
          let toView = transitionContext.view(forKey: .to)
    else { return completedAnimator(context: transitionContext) }

    let container = transitionContext.containerView
    toView.frame = transitionContext.finalFrame(for: detailController)
    container.addSubview(toView)
    toView.layoutIfNeeded()

    let detailView = detailController.detailView
    let source = detailController.transitionSourceView()
    if let image = (source as? UIImageView)?.image {
      detailView.setOpeningPlaceholderImage(image)
    }
    sourceView = source
    source?.isHidden = true
    let sourceRect = source.map { $0.convert($0.bounds, to: detailView) }
    let initialTransform = sourceRect.flatMap(detailView.transitionTransform) ?? .identity

    detailView.prepareTransition(
      mediaTransform: initialTransform,
      backdropAlpha: source == nil ? 1 : 0,
      chromeAlpha: source == nil ? 1 : 0
    )

    if UIAccessibility.isReduceMotionEnabled || source == nil {
      detailView.completePresentedTransition()
      let animator = UIViewPropertyAnimator(duration: 0, curve: .linear)
      animator.addCompletion { _ in
        source?.isHidden = false
        transitionContext.completeTransition(!transitionContext.transitionWasCancelled)
      }
      return animator
    }

    let mediaAnimator = UIViewPropertyAnimator(duration: 0.42, dampingRatio: 0.92) {
      detailView.transitionMediaView.transform = .identity
    }
    let backdropAnimator = UIViewPropertyAnimator(duration: 0.24, curve: .easeOut) {
      detailView.applyTransition(
        mediaTransform: detailView.transitionMediaView.transform,
        mediaAlpha: 1,
        backdropAlpha: 1,
        chromeAlpha: 0
      )
    }
    let chromeAnimator = UIViewPropertyAnimator(duration: 0.16, curve: .easeOut) {
      detailView.applyTransition(
        mediaTransform: detailView.transitionMediaView.transform,
        mediaAlpha: 1,
        backdropAlpha: 1,
        chromeAlpha: 1
      )
    }
    self.backdropAnimator = backdropAnimator
    self.chromeAnimator = chromeAnimator
    backdropAnimator.startAnimation()
    chromeAnimator.startAnimation(afterDelay: 0.26)
    mediaAnimator.addCompletion { [weak self] _ in
      let completed = !transitionContext.transitionWasCancelled
      if completed {
        detailView.completePresentedTransition()
        detailController.presentationTransitionDidFinish()
      }
      source?.isHidden = false
      transitionContext.completeTransition(completed)
      self?.animator = nil
    }
    return mediaAnimator
  }

  private func makeDismissalAnimator(
    using transitionContext: UIViewControllerContextTransitioning
  ) -> UIViewPropertyAnimator {
    guard let detailController,
          let fromView = transitionContext.view(forKey: .from)
    else { return completedAnimator(context: transitionContext) }

    if interaction?.isInteracting == true {
      return makeInteractiveDismissalAnimator(
        using: transitionContext,
        fromView: fromView
      )
    }

    let detailView = detailController.detailView
    let source = detailController.transitionSourceView()
    sourceView = source
    source?.isHidden = true
    let sourceRect = source.map { $0.convert($0.bounds, to: detailView) }
    let target = sourceRect.flatMap {
      detailView.transitionTarget(
        targetRect: $0,
        targetCornerRadius: source?.layer.cornerRadius ?? 0
      )
    }
    let targetTransform = sourceRect.flatMap(detailView.transitionTransform)
      ?? offscreenTransform(for: detailView)
    let fadesMedia = source == nil
    detailView.prepareDismissalTransition(target: target)

    let animator = UIViewPropertyAnimator(duration: 0.36, dampingRatio: 0.92) {
      if let target {
        detailView.applyDismissalTransition(
          target: target,
          mediaAlpha: 1,
          backdropAlpha: 0,
          chromeAlpha: 0
        )
      } else {
        detailView.applyTransition(
          mediaTransform: targetTransform,
          mediaAlpha: fadesMedia ? 0 : 1,
          backdropAlpha: 0,
          chromeAlpha: 0
        )
      }
    }
    animator.addCompletion { [weak self] position in
      let completed = position == .end && !transitionContext.transitionWasCancelled
      source?.isHidden = false
      if completed {
        fromView.removeFromSuperview()
      } else {
        detailView.cancelViewControllerDismissal()
      }
      transitionContext.completeTransition(completed)
      self?.animator = nil
    }
    return animator
  }

  private func makeInteractiveDismissalAnimator(
    using transitionContext: UIViewControllerContextTransitioning,
    fromView: UIView
  ) -> UIViewPropertyAnimator {
    let marker = UIView(frame: .zero)
    marker.alpha = 0
    transitionContext.containerView.addSubview(marker)
    let animator = UIViewPropertyAnimator(duration: 0.36, curve: .linear) {
      marker.alpha = 1
    }
    animator.addCompletion { [weak self] position in
      marker.removeFromSuperview()
      let completed = position == .end && !transitionContext.transitionWasCancelled
      if completed {
        fromView.removeFromSuperview()
      }
      transitionContext.completeTransition(completed)
      self?.animator = nil
    }
    return animator
  }

  private func offscreenTransform(for detailView: PhotoDetailView) -> CGAffineTransform {
    let translation = interaction?.translation ?? .zero
    let velocity = interaction?.velocity ?? .zero
    let driftX = min(max(translation.x + velocity.x * 0.08, -70), 70)
    let driftY = min(max(translation.y + velocity.y * 0.08, 90), 260)
    return CGAffineTransform(translationX: driftX, y: driftY)
      .scaledBy(x: 0.6, y: 0.6)
  }

  private func completedAnimator(
    context: UIViewControllerContextTransitioning
  ) -> UIViewPropertyAnimator {
    let animator = UIViewPropertyAnimator(duration: 0, curve: .linear)
    animator.addCompletion { _ in
      context.completeTransition(!context.transitionWasCancelled)
    }
    return animator
  }
}
