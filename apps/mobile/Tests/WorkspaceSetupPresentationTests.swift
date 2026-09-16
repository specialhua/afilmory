import XCTest

@testable import Afilmory

final class WorkspaceSetupPresentationTests: XCTestCase {
  func testAMissingWorkspaceIsNotUsable() {
    let session = Self.makeSession(workspace: nil)

    XCTAssertFalse(session.hasUsableWorkspace)
    XCTAssertEqual(session.workspaceSetupMode, .create)
  }

  func testAPendingWorkspaceIsNotUsable() {
    let session = Self.makeSession(workspace: Self.makeWorkspace(status: "pending"))

    XCTAssertFalse(session.hasUsableWorkspace)
    XCTAssertEqual(
      session.workspaceSetupMode,
      .waiting(name: "Acme", slug: "acme")
    )
  }

  func testAnActiveWorkspaceIsUsable() {
    let session = Self.makeSession(workspace: Self.makeWorkspace(status: "active"))

    XCTAssertTrue(session.hasUsableWorkspace)
    XCTAssertNil(session.workspaceSetupMode)
  }

  func testSignedInWithoutAUsableWorkspaceUsesTheSetupRoot() {
    let missing = AfilmorySessionState.signedIn(Self.makeSession(workspace: nil))
    let pending = AfilmorySessionState.signedIn(
      Self.makeSession(workspace: Self.makeWorkspace(status: "pending"))
    )

    XCTAssertEqual(missing.rootPresentation, .workspaceSetup)
    XCTAssertEqual(pending.rootPresentation, .workspaceSetup)
    XCTAssertFalse(missing.shouldApplyPendingDeepLink)
    XCTAssertFalse(missing.shouldPresentTestFlightPrompt)
  }

  func testSignedInWithAUsableWorkspaceUsesTabs() {
    let state = AfilmorySessionState.signedIn(
      Self.makeSession(workspace: Self.makeWorkspace(status: "active"))
    )

    XCTAssertEqual(state.rootPresentation, .authenticatedTabs)
    XCTAssertTrue(state.shouldApplyPendingDeepLink)
    XCTAssertTrue(state.shouldPresentTestFlightPrompt)
  }

  func testVisitorAndLoadingRootsStayUnchanged() {
    XCTAssertEqual(AfilmorySessionState.loading.rootPresentation, .loading)
    XCTAssertEqual(AfilmorySessionState.signedOut.rootPresentation, .visitor)
    XCTAssertEqual(AfilmorySessionState.failed("offline").rootPresentation, .visitor)

    XCTAssertFalse(AfilmorySessionState.loading.shouldApplyPendingDeepLink)
    XCTAssertFalse(AfilmorySessionState.loading.shouldPresentTestFlightPrompt)
    XCTAssertTrue(AfilmorySessionState.signedOut.shouldApplyPendingDeepLink)
    XCTAssertTrue(AfilmorySessionState.signedOut.shouldPresentTestFlightPrompt)
  }

  private static func makeSession(workspace: AfilmorySessionWorkspace?) -> AfilmorySession {
    AfilmorySession(
      user: AfilmorySessionUser(
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        image: nil,
        role: "user"
      ),
      activeWorkspace: workspace,
      requestedWorkspace: nil,
      requestedMembership: nil,
      memberships: workspace.map {
        [AfilmorySessionMembership(id: "membership-1", role: "owner", status: "active", workspace: $0)]
      } ?? [],
      activeMembership: workspace.map {
        AfilmorySessionMembership(id: "membership-1", role: "owner", status: "active", workspace: $0)
      }
    )
  }

  private static func makeWorkspace(status: String) -> AfilmorySessionWorkspace {
    AfilmorySessionWorkspace(
      id: "workspace-1",
      slug: "acme",
      name: "Acme",
      status: status,
      isPlaceholder: status != "active"
    )
  }
}
