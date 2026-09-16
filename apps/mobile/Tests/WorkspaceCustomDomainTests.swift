import XCTest

@testable import Afilmory

final class WorkspaceCustomDomainTests: XCTestCase {
  func testNormalizeStripsProtocolPathPortAndTrailingDot() {
    XCTAssertEqual(
      WorkspaceCustomDomain.normalize("https://Photos.Ada.com:443/gallery/"),
      "photos.ada.com"
    )
    XCTAssertEqual(WorkspaceCustomDomain.normalize("  photos.ada.com.  "), "photos.ada.com")
  }

  func testEmptyInputIsSkipped() {
    XCTAssertEqual(WorkspaceCustomDomain.decision(for: "   ", limit: 0, used: 0), .skipped)
    XCTAssertEqual(WorkspaceCustomDomain.decision(for: "", limit: nil, used: 0), .skipped)
  }

  func testAFreePlanNeedsAnUpgradeBeforeBinding() {
    XCTAssertEqual(
      WorkspaceCustomDomain.decision(for: "photos.ada.com", limit: 0, used: 0),
      .needsUpgrade(current: 0, limit: 0)
    )
  }

  func testAnEntitledPlanRequestsTheNormalizedDomain() {
    XCTAssertEqual(
      WorkspaceCustomDomain.decision(for: "https://Photos.Ada.com", limit: 1, used: 0),
      .request("photos.ada.com")
    )
    XCTAssertEqual(
      WorkspaceCustomDomain.decision(for: "photos.ada.com", limit: nil, used: 0),
      .request("photos.ada.com")
    )
  }

  func testAFilledLimitNeedsAnUpgrade() {
    XCTAssertEqual(
      WorkspaceCustomDomain.decision(for: "photos.ada.com", limit: 1, used: 1),
      .needsUpgrade(current: 1, limit: 1)
    )
  }

  func testInvalidHostnamesAreRejected() {
    XCTAssertFalse(WorkspaceCustomDomain.isValid("ada"))
    XCTAssertFalse(WorkspaceCustomDomain.isValid("photos ada.com"))
    XCTAssertFalse(WorkspaceCustomDomain.isValid("-photos.ada.com"))
    XCTAssertTrue(WorkspaceCustomDomain.isValid("photos.ada.com"))
  }
}
