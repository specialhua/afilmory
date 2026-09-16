import UIKit

@MainActor
final class TestFlightAppStorePrompt {
  static let listingURL = URL(string: "https://apps.apple.com/app/id6796660831")!

  static let shared = TestFlightAppStorePrompt(
    isTestFlight: AfilmoryBuildConfiguration.isTestFlight
  )

  private static let dismissedKey = "afilmory.testflight.appStoreSupportPromptDismissed"

  private let isTestFlight: Bool
  private let defaults: UserDefaults
  private let openURL: (URL) -> Void

  init(
    isTestFlight: Bool,
    defaults: UserDefaults = .standard,
    openURL: @escaping (URL) -> Void = { UIApplication.shared.open($0) }
  ) {
    self.isTestFlight = isTestFlight
    self.defaults = defaults
    self.openURL = openURL
  }

  var shouldPresent: Bool {
    isTestFlight && !defaults.bool(forKey: Self.dismissedKey)
  }

  func dismiss() {
    defaults.set(true, forKey: Self.dismissedKey)
  }

  func openAppStore() {
    dismiss()
    openURL(Self.listingURL)
  }

  func present(from presenter: UIViewController, force: Bool = false) {
    guard force || shouldPresent else { return }
    guard presenter.presentedViewController == nil else { return }
    presenter.present(makeAlert(), animated: true)
  }

  func presentFromKeyWindow(force: Bool = false) {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var top = window?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    guard let top else { return }
    present(from: top, force: force)
  }

  private func makeAlert() -> UIAlertController {
    let alert = UIAlertController(
      title: String(localized: "Afilmory is on the App Store"),
      message: String(
        localized: "This TestFlight build is for trying new versions. If you enjoy Afilmory, download it from the App Store — a rating there helps a lot."
      ),
      preferredStyle: .alert
    )
    alert.addAction(
      UIAlertAction(title: String(localized: "Open App Store"), style: .default) { [weak self] _ in
        self?.openAppStore()
      }
    )
    alert.addAction(
      UIAlertAction(title: String(localized: "Not now"), style: .cancel) { [weak self] _ in
        self?.dismiss()
      }
    )
    return alert
  }
}
