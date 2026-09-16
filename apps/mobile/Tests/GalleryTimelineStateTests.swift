import XCTest

@testable import Afilmory

final class GalleryTimelineStateTests: XCTestCase {
  func testEmptyKinds() {
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: false, eventCount: 0, isLoading: false, loadFailed: false),
      .noSubscriptions
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: false, loadFailed: false),
      .noRecentUpdates
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: true, loadFailed: false),
      .none
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: false, loadFailed: true),
      .none
    )
  }

  func testDropTenant() {
    let kept = GalleryTimelineEvent(
      day: "2026-08-19",
      gallery: .init(author: nil, id: "a", name: "A", slug: "a"),
      id: "a:2026-08-19",
      latestAt: "2026-08-19T00:00:00.000Z",
      photos: [],
      tenantId: "a",
      totalCount: 0
    )
    let dropped = GalleryTimelineEvent(
      day: "2026-08-19",
      gallery: .init(author: nil, id: "b", name: "B", slug: "b"),
      id: "b:2026-08-19",
      latestAt: "2026-08-19T00:00:00.000Z",
      photos: [],
      tenantId: "b",
      totalCount: 0
    )
    XCTAssertEqual(removingTimelineEvents([kept, dropped], tenantId: "b").map(\.tenantId), ["a"])
  }
}
