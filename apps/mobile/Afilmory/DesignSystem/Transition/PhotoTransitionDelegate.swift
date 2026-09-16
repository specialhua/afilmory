import UIKit

final class PhotoTransitionDelegate: NSObject, UIViewControllerTransitioningDelegate {
  let interaction = PhotoTransitionInteraction()
  private weak var detailController: PhotoDetailViewController?
  private weak var presentationAnimator: PhotoTransitionAnimator?

  init(detailController: PhotoDetailViewController) {
    self.detailController = detailController
    super.init()
  }

  func presentationController(
    forPresented presented: UIViewController,
    presenting: UIViewController?,
    source: UIViewController
  ) -> UIPresentationController? {
    PhotoPresentationController(
      presentedViewController: presented,
      presenting: presenting
    )
  }

  func animationController(
    forPresented presented: UIViewController,
    presenting: UIViewController,
    source: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    guard let detailController else { return nil }
    let animator = PhotoTransitionAnimator(
      direction: .presenting,
      detailController: detailController,
      interaction: interaction
    )
    presentationAnimator = animator
    return animator
  }

  func animationController(forDismissed dismissed: UIViewController)
    -> UIViewControllerAnimatedTransitioning?
  {
    guard let detailController else { return nil }
    return PhotoTransitionAnimator(
      direction: .dismissing,
      detailController: detailController,
      interaction: interaction
    )
  }

  func interactionControllerForDismissal(
    using animator: UIViewControllerAnimatedTransitioning
  ) -> UIViewControllerInteractiveTransitioning? {
    interaction.isInteracting ? interaction : nil
  }

  func finishPresentationForGeometryChange() {
    presentationAnimator?.finishPresentationForGeometryChange()
  }
}
