import UIKit

private let badgeMinHeight: CGFloat = 16
private let badgeHorizontalPadding: CGFloat = 5

// Shows the focused item's total while scrubbing, then the running combo while
// a hold streams. It floats above the bar, over the photo, so it carries its own
// shadow rather than relying on a backdrop.
final class PhotoDetailReactionFocusLabel: UILabel {
  init() {
    super.init(frame: .zero)
    font = .monospacedDigitSystemFont(ofSize: 13, weight: .bold)
    isAccessibilityElement = false
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOffset = CGSize(width: 0, height: 1)
    layer.shadowOpacity = 0.7
    layer.shadowRadius = 4
    textAlignment = .center
    textColor = .white
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }
}

final class PhotoDetailReactionBadge: UILabel {
  var count = 0 {
    didSet {
      text = count > 999 ? "999+" : "\(count)"
      isHidden = count <= 0
      superview?.setNeedsLayout()
    }
  }

  var badgeSize: CGSize {
    CGSize(
      width: max(badgeMinHeight, intrinsicContentSize.width + badgeHorizontalPadding * 2),
      height: badgeMinHeight
    )
  }

  init() {
    super.init(frame: .zero)

    backgroundColor = UIColor.black.withAlphaComponent(0.72)
    clipsToBounds = true
    font = .monospacedDigitSystemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .caption2).pointSize,
      weight: .semibold
    )
    isAccessibilityElement = false
    isHidden = true
    layer.cornerCurve = .continuous
    textAlignment = .center
    textColor = .white
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }
}

final class PhotoDetailReactionAccessibilityElement: UIAccessibilityElement {
  var onActivate: (() -> Void)?

  override func accessibilityActivate() -> Bool {
    onActivate?()
    return true
  }
}
