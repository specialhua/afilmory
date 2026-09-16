import UIKit

final class GallerySearchSummaryView: UICollectionReusableView {
  static let reuseIdentifier = "GallerySearchSummaryView"
  static let preferredHeight: CGFloat = 52

  private let iconView = UIImageView()
  private let label = UILabel()
  private var horizontalInset: CGFloat = 16

  override init(frame: CGRect) {
    super.init(frame: frame)
    iconView.image = UIImage(systemName: "magnifyingglass")
    iconView.tintColor = .secondaryLabel
    iconView.contentMode = .scaleAspectFit
    addSubview(iconView)

    label.font = .preferredFont(forTextStyle: .subheadline)
    label.textColor = .secondaryLabel
    label.adjustsFontForContentSizeCategory = true
    addSubview(label)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func configure(text: String, horizontalInset: CGFloat) {
    label.text = text
    accessibilityLabel = text
    self.horizontalInset = horizontalInset
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let iconSize: CGFloat = 16
    let contentHeight: CGFloat = 24
    let originY = (bounds.height - contentHeight) / 2
    iconView.frame = CGRect(x: horizontalInset, y: originY + 4, width: iconSize, height: iconSize)
    label.frame = CGRect(
      x: iconView.frame.maxX + 8,
      y: originY,
      width: max(bounds.width - iconView.frame.maxX - horizontalInset - 8, 0),
      height: contentHeight
    )
  }
}
