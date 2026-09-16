import UIKit

struct PageEmptyStateAction {
  let title: String
  let handler: () -> Void
}

struct PageEmptyStateContent {
  let symbolName: String
  let title: String
  let subtitle: String?
  var primaryAction: PageEmptyStateAction?
  var secondaryAction: PageEmptyStateAction?
}

// UIContentUnavailableConfiguration renders through an out-of-hierarchy path on iOS 26
// and its buttonProperties actions never receive touches when the controller is embedded
// in the RN page host, so buttoned empty states go through this plain view instead.
final class PageEmptyStateView: UIView {
  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()
  private let primaryButton = UIButton(configuration: .filled())
  private let secondaryButton = UIButton(configuration: .plain())
  private let contentStack = UIStackView()
  private var onPrimary: (() -> Void)?
  private var onSecondary: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)

    iconView.contentMode = .scaleAspectFit
    iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 44, weight: .regular)
    iconView.tintColor = .secondaryLabel

    titleLabel.font = .systemFont(ofSize: 22, weight: .bold)
    titleLabel.textColor = .label
    titleLabel.textAlignment = .center
    titleLabel.numberOfLines = 0

    subtitleLabel.font = .systemFont(ofSize: 15, weight: .regular)
    subtitleLabel.textColor = .secondaryLabel
    subtitleLabel.textAlignment = .center
    subtitleLabel.numberOfLines = 0

    primaryButton.addAction(
      UIAction { [weak self] _ in self?.onPrimary?() },
      for: .touchUpInside
    )
    secondaryButton.addAction(
      UIAction { [weak self] _ in self?.onSecondary?() },
      for: .touchUpInside
    )

    contentStack.translatesAutoresizingMaskIntoConstraints = false
    contentStack.axis = .vertical
    contentStack.alignment = .center
    contentStack.spacing = 10
    for subview in [iconView, titleLabel, subtitleLabel, primaryButton, secondaryButton] {
      contentStack.addArrangedSubview(subview)
    }
    contentStack.setCustomSpacing(16, after: iconView)
    contentStack.setCustomSpacing(22, after: subtitleLabel)
    addSubview(contentStack)

    NSLayoutConstraint.activate([
      contentStack.centerXAnchor.constraint(equalTo: centerXAnchor),
      contentStack.centerYAnchor.constraint(equalTo: centerYAnchor),
      contentStack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
      contentStack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func apply(_ content: PageEmptyStateContent) {
    iconView.image = UIImage(systemName: content.symbolName)
    titleLabel.text = content.title
    subtitleLabel.text = content.subtitle
    subtitleLabel.isHidden = content.subtitle == nil

    if let primary = content.primaryAction {
      primaryButton.configuration?.title = primary.title
      onPrimary = primary.handler
      primaryButton.isHidden = false
    } else {
      onPrimary = nil
      primaryButton.isHidden = true
    }

    if let secondary = content.secondaryAction {
      secondaryButton.configuration?.title = secondary.title
      onSecondary = secondary.handler
      secondaryButton.isHidden = false
    } else {
      onSecondary = nil
      secondaryButton.isHidden = true
    }
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let view = super.hitTest(point, with: event)
    return view === self ? nil : view
  }
}
