import UIKit

@MainActor
final class ExploreSectionRailView: UIView {
  var onSelect: ((ExploreSegment) -> Void)?

  private let control: LiquidGlassSegmentedControl
  private let driver: LiquidGlassSegmentLiftDriver
  private var selectionPosition = CGFloat(ExploreSegment.explore.rawValue)

  private static let railHeight: CGFloat = 44
  private static let segmentPadding: CGFloat = 18

  override init(frame: CGRect) {
    control = LiquidGlassSegmentedControl(items: [
      String(localized: "Timeline"),
      String(localized: "Following"),
      String(localized: "Discover"),
    ])
    driver = LiquidGlassSegmentLiftDriver(control: control)
    super.init(frame: frame)
    accessibilityIdentifier = "explore.sectionRail"

    control.selectedSegmentIndex = ExploreSegment.explore.rawValue
    control.apportionsSegmentWidthsByContent = false
    control.translatesAutoresizingMaskIntoConstraints = false
    applySegmentMetrics()
    control.addAction(
      UIAction { [weak self] _ in self?.segmentSelectionChanged() },
      for: .valueChanged
    )
    control.applyIndicatorProgressAfterLayout = { [weak self] in
      guard let self else { return }
      driver.setIndicatorProgress(visualProgress(for: selectionPosition))
    }
    addSubview(control)

    NSLayoutConstraint.activate([
      control.topAnchor.constraint(equalTo: topAnchor),
      control.leadingAnchor.constraint(equalTo: leadingAnchor),
      control.trailingAnchor.constraint(equalTo: trailingAnchor),
      control.bottomAnchor.constraint(equalTo: bottomAnchor),
      control.heightAnchor.constraint(equalToConstant: Self.railHeight),
    ])

    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (self: ExploreSectionRailView, _: UITraitCollection) in
      self.applySegmentMetrics()
      self.invalidateIntrinsicContentSize()
    }
  }

  private func applySegmentMetrics() {
    let font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(
      for: .systemFont(ofSize: 15, weight: .semibold),
      maximumPointSize: 19
    )
    control.setTitleTextAttributes([.font: font], for: .normal)
    for index in 0..<control.numberOfSegments {
      guard let title = control.titleForSegment(at: index) else { continue }
      let width = ceil((title as NSString).size(withAttributes: [.font: font]).width)
      control.setWidth(width + Self.segmentPadding * 2, forSegmentAt: index)
    }
    invalidateIntrinsicContentSize()
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: control.intrinsicContentSize.width, height: Self.railHeight)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    driver.prepareGlass()
    driver.setIndicatorProgress(visualProgress(for: selectionPosition))
  }

  func setSelected(_ segment: ExploreSegment) {
    selectionPosition = CGFloat(segment.rawValue)
    if control.selectedSegmentIndex != segment.rawValue {
      control.selectedSegmentIndex = segment.rawValue
    }
    driver.setLifted(false)
    driver.setIndicatorProgress(visualProgress(for: selectionPosition))
  }

  func setSelectionProgress(_ progress: CGFloat) {
    let upperBound = CGFloat(ExploreSegment.allCases.count - 1)
    selectionPosition = min(max(progress, 0), upperBound)
    driver.setIndicatorProgress(visualProgress(for: selectionPosition))
  }

  func beginInteractiveTransition() {
    driver.setLifted(true)
  }

  private func segmentSelectionChanged() {
    guard let segment = ExploreSegment(rawValue: control.selectedSegmentIndex) else { return }
    driver.setLifted(true)
    onSelect?(segment)
  }

  private func visualProgress(for position: CGFloat) -> CGFloat {
    guard effectiveUserInterfaceLayoutDirection == .rightToLeft else { return position }
    return CGFloat(ExploreSegment.allCases.count - 1) - position
  }
}
