import XCTest

@testable import Afilmory

final class WorkspaceOnboardingDefaultsTests: XCTestCase {
  func testPrefillsFromAnOAuthDisplayName() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "Ada", email: "ada@example.com")

    XCTAssertEqual(defaults.displayName, "Ada")
    XCTAssertEqual(defaults.workspaceName, "Ada's Afilmory")
    XCTAssertEqual(defaults.slug, "ada")
    XCTAssertEqual(defaults.siteName, "Ada's Afilmory")
    XCTAssertEqual(defaults.siteTitle, "Ada's Afilmory")
    XCTAssertEqual(defaults.siteDescription, "A curated photo gallery by Ada on Afilmory.")
    XCTAssertEqual(
      defaults.siteSettings.map(\.key),
      ["site.name", "site.title", "site.description"]
    )
    XCTAssertEqual(defaults.siteSettings.map(\.value), [
      "Ada's Afilmory",
      "Ada's Afilmory",
      "A curated photo gallery by Ada on Afilmory.",
    ])
  }

  func testANameEndingInSUsesTheWebPossessive() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "James", email: "james@example.com")

    XCTAssertEqual(defaults.workspaceName, "James' Afilmory")
    XCTAssertEqual(defaults.slug, "james")
  }

  func testEmailLoginFallsBackToTheLocalPart() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "  ", email: "alice.photo@example.com")

    XCTAssertEqual(defaults.displayName, "alice.photo")
    XCTAssertEqual(defaults.workspaceName, "alice.photo's Afilmory")
    XCTAssertEqual(defaults.slug, "alice-photo")
  }

  func testANamelessAccountLeavesTheNameAndSlugEmpty() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "", email: "")

    XCTAssertEqual(defaults.displayName, "")
    XCTAssertEqual(defaults.workspaceName, "")
    XCTAssertEqual(defaults.slug, "")
    XCTAssertTrue(WorkspaceSlugResolver.candidates(base: defaults.displayName).isEmpty)
  }

  func testASingleLetterNameDoesNotProduceAUsableSlug() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "A", email: "sunset.lab@example.com")

    XCTAssertEqual(defaults.displayName, "A")
    XCTAssertEqual(defaults.workspaceName, "A's Afilmory")
    XCTAssertEqual(defaults.slug, "a")
    XCTAssertTrue(WorkspaceSlugResolver.candidates(base: defaults.displayName).isEmpty)
  }

  func testEditedWorkspaceNameUpdatesSiteTitleButKeepsTheAccountDescription() {
    let defaults = WorkspaceOnboardingDefaults.make(name: "Ada", email: "ada@example.com")
    let settings = Dictionary(uniqueKeysWithValues: defaults.siteSettings(for: "Sunset Gallery"))

    XCTAssertEqual(settings["site.name"], "Sunset Gallery")
    XCTAssertEqual(settings["site.title"], "Sunset Gallery")
    XCTAssertEqual(settings["site.description"], "A curated photo gallery by Ada on Afilmory.")
  }
}
