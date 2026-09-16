import UIKit

final class PhotoPresentationController: UIPresentationController {
  override var shouldRemovePresentersView: Bool { false }
  override var shouldPresentInFullscreen: Bool { true }

  override var frameOfPresentedViewInContainerView: CGRect {
    containerView?.bounds ?? .zero
  }

  override func containerViewWillLayoutSubviews() {
    super.containerViewWillLayoutSubviews()
    presentedView?.frame = frameOfPresentedViewInContainerView
  }

  override func adaptivePresentationStyle(
    for traitCollection: UITraitCollection
  ) -> UIModalPresentationStyle {
    .none
  }
}
