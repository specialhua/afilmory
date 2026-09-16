import UIKit

final class GalleryNotificationBannerView: UICollectionReusableView {
  static let reuseIdentifier = "GalleryNotificationBannerView"
  static let preferredHeight: CGFloat = 96

  private let containerView = UIView()
  private let iconBackgroundView = UIView()
  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let detailLabel = UILabel()
  private let actionButton = UIButton(type: .system)
  private var containerLeadingConstraint: NSLayoutConstraint!
  private var containerTrailingConstraint: NSLayoutConstraint!
  private var onAction: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)

    containerView.translatesAutoresizingMaskIntoConstraints = false
    containerView.backgroundColor = .secondarySystemGroupedBackground
    containerView.layer.borderColor = UIColor.separator.withAlphaComponent(0.35).cgColor
    containerView.layer.borderWidth = 1 / max(UIScreen.main.scale, 1)
    containerView.layer.cornerCurve = .continuous
    containerView.layer.cornerRadius = 14
    addSubview(containerView)

    iconBackgroundView.translatesAutoresizingMaskIntoConstraints = false
    iconBackgroundView.layer.cornerCurve = .continuous
    iconBackgroundView.layer.cornerRadius = 17
    containerView.addSubview(iconBackgroundView)

    iconView.translatesAutoresizingMaskIntoConstraints = false
    iconView.contentMode = .scaleAspectFit
    iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
    iconView.isAccessibilityElement = false
    iconBackgroundView.addSubview(iconView)

    titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
    titleLabel.textColor = .label
    titleLabel.numberOfLines = 1

    detailLabel.font = .systemFont(ofSize: 12, weight: .regular)
    detailLabel.textColor = .secondaryLabel
    detailLabel.numberOfLines = 2

    let textStack = UIStackView(arrangedSubviews: [titleLabel, detailLabel])
    textStack.translatesAutoresizingMaskIntoConstraints = false
    textStack.axis = .vertical
    textStack.alignment = .fill
    textStack.spacing = 3
    containerView.addSubview(textStack)

    actionButton.translatesAutoresizingMaskIntoConstraints = false
    actionButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    actionButton.addAction(
      UIAction { [weak self] _ in self?.onAction?() },
      for: .touchUpInside
    )
    containerView.addSubview(actionButton)

    containerLeadingConstraint = containerView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16)
    containerTrailingConstraint = containerView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16)
    NSLayoutConstraint.activate([
      containerLeadingConstraint,
      containerTrailingConstraint,
      containerView.topAnchor.constraint(equalTo: topAnchor, constant: 6),
      containerView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),

      iconBackgroundView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 14),
      iconBackgroundView.centerYAnchor.constraint(equalTo: containerView.centerYAnchor),
      iconBackgroundView.widthAnchor.constraint(equalToConstant: 34),
      iconBackgroundView.heightAnchor.constraint(equalToConstant: 34),

      iconView.centerXAnchor.constraint(equalTo: iconBackgroundView.centerXAnchor),
      iconView.centerYAnchor.constraint(equalTo: iconBackgroundView.centerYAnchor),
      iconView.widthAnchor.constraint(equalToConstant: 18),
      iconView.heightAnchor.constraint(equalToConstant: 18),

      textStack.leadingAnchor.constraint(equalTo: iconBackgroundView.trailingAnchor, constant: 11),
      textStack.centerYAnchor.constraint(equalTo: containerView.centerYAnchor),
      textStack.trailingAnchor.constraint(equalTo: actionButton.leadingAnchor, constant: -10),

      actionButton.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -12),
      actionButton.centerYAnchor.constraint(equalTo: containerView.centerYAnchor),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    onAction = nil
  }

  func configure(
    state: GalleryNotificationBannerState,
    title: String,
    detail: String,
    actionTitle: String,
    horizontalInset: CGFloat,
    onAction: @escaping () -> Void
  ) {
    self.onAction = onAction
    titleLabel.text = title
    detailLabel.text = detail
    containerLeadingConstraint.constant = horizontalInset
    containerTrailingConstraint.constant = -horizontalInset

    let isDisabled = state == .openSettings
    let accentColor: UIColor = isDisabled ? .systemOrange : .systemBlue
    iconView.image = UIImage(systemName: isDisabled ? "bell.slash.fill" : "bell.badge.fill")
    iconView.tintColor = accentColor
    iconBackgroundView.backgroundColor = accentColor.withAlphaComponent(0.12)

    var configuration = UIButton.Configuration.tinted()
    configuration.buttonSize = .small
    configuration.cornerStyle = .capsule
    configuration.baseForegroundColor = accentColor
    configuration.baseBackgroundColor = accentColor
    configuration.title = actionTitle
    actionButton.configuration = configuration
    actionButton.accessibilityLabel = actionTitle
  }
}
