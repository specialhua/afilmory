import XCTest

@testable import Afilmory

final class WorkspaceSlugResolverTests: XCTestCase {
  func testCandidatesStartAtTheNormalizedNameAndThenSuffix() {
    XCTAssertEqual(
      WorkspaceSlugResolver.candidates(base: "Ada", limit: 3),
      ["ada", "ada-2", "ada-3"]
    )
  }

  func testCandidatesRejectSlugsShorterThanThreeCharacters() {
    XCTAssertEqual(WorkspaceSlugResolver.candidates(base: "Al"), [])
    XCTAssertEqual(WorkspaceSlugResolver.candidates(base: "  "), [])
  }

  func testFirstAvailableSkipsReservedOrTakenCandidates() async throws {
    var seen: [String] = []
    let slug = try await WorkspaceSlugResolver.firstAvailable(base: "Admin") { candidate in
      seen.append(candidate)
      if candidate == "admin" || candidate == "admin-2" {
        return .unavailable("taken")
      }
      return .available(candidate)
    }

    XCTAssertEqual(slug, "admin-3")
    XCTAssertEqual(seen, ["admin", "admin-2", "admin-3"])
  }

  func testFirstAvailableReturnsNilWhenEveryCandidateIsUnavailable() async throws {
    let slug = try await WorkspaceSlugResolver.firstAvailable(base: "Ada", limit: 2) { _ in
      .unavailable("taken")
    }

    XCTAssertNil(slug)
  }

  func testFirstAvailablePropagatesTransportErrors() async {
    enum ProbeError: Error { case offline }

    do {
      _ = try await WorkspaceSlugResolver.firstAvailable(base: "Ada") { _ in
        throw ProbeError.offline
      }
      XCTFail("Expected the transport error to propagate")
    } catch ProbeError.offline {
      // expected
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }
}
