import XCTest

@testable import Afilmory

final class ExploreSegmentPolicyTests: XCTestCase {
  func testSignedOutAlwaysExplore() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: false, cachedHasSubscriptions: true), .explore)
  }

  func testCachedTrueOpensTimeline() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: true), .timeline)
  }

  func testMissingCacheOpensExplore() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: nil), .explore)
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: false), .explore)
  }

  func testFetchDoesNotOverrideAManualChoice() {
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .explore, userHasChosen: true, hasSubscriptions: true),
      .explore
    )
  }

  func testFetchCalibratesWhenTheUserHasNotChosen() {
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .explore, userHasChosen: false, hasSubscriptions: true),
      .timeline
    )
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .timeline, userHasChosen: false, hasSubscriptions: false),
      .explore
    )
  }

  func testHorizontalPageOffsetResolvesTheNearestSection() {
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 0, pageWidth: 390, fallback: .explore), .timeline)
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 390, pageWidth: 390, fallback: .explore), .following)
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 780, pageWidth: 390, fallback: .timeline), .explore)
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 585, pageWidth: 390, fallback: .timeline), .explore)
  }

  func testHorizontalPageOffsetClampsAndPreservesFallbackWithoutLayout() {
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: -200, pageWidth: 390, fallback: .following), .timeline)
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 1_500, pageWidth: 390, fallback: .following), .explore)
    XCTAssertEqual(resolveExploreSegment(pageOffsetX: 500, pageWidth: 0, fallback: .following), .following)
  }
}
