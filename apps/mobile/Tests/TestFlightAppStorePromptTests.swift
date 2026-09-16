import XCTest

@testable import Afilmory

@MainActor
final class TestFlightAppStorePromptTests: XCTestCase {
  private var defaults: UserDefaults!
  private var suiteName: String!
  private var openedURLs: [URL] = []

  override func setUp() {
    super.setUp()
    suiteName = "app.afilmory.tests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: suiteName)
    openedURLs = []
  }

  override func tearDown() {
    defaults.removePersistentDomain(forName: suiteName)
    defaults = nil
    suiteName = nil
    super.tearDown()
  }

  func testDoesNotPresentOutsideTestFlight() {
    let prompt = makePrompt(isTestFlight: false)

    XCTAssertFalse(prompt.shouldPresent)
  }

  func testPresentsOnceOnTestFlightUntilDismissed() {
    let prompt = makePrompt(isTestFlight: true)

    XCTAssertTrue(prompt.shouldPresent)
    prompt.dismiss()
    XCTAssertFalse(prompt.shouldPresent)
  }

  func testOpeningTheAppStoreDismissesAndUsesTheLiveListing() {
    let prompt = makePrompt(isTestFlight: true)

    prompt.openAppStore()

    XCTAssertFalse(prompt.shouldPresent)
    XCTAssertEqual(openedURLs, [URL(string: "https://apps.apple.com/app/id6796660831")])
  }

  func testDismissalSurvivesANewPromptInstance() {
    makePrompt(isTestFlight: true).dismiss()

    XCTAssertFalse(makePrompt(isTestFlight: true).shouldPresent)
  }

  private func makePrompt(isTestFlight: Bool) -> TestFlightAppStorePrompt {
    TestFlightAppStorePrompt(
      isTestFlight: isTestFlight,
      defaults: defaults,
      openURL: { [weak self] url in
        self?.openedURLs.append(url)
      }
    )
  }
}
