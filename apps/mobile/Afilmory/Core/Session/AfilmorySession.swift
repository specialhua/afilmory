import Foundation

struct AfilmorySessionUser: Codable, Equatable, Sendable {
  let id: String
  let name: String
  let email: String
  let image: String?
  let role: String?
}

struct AfilmorySessionWorkspace: Codable, Equatable, Sendable {
  let id: String
  let slug: String
  let name: String
  let status: String
  let isPlaceholder: Bool?
}

struct AfilmorySessionMembership: Codable, Equatable, Sendable {
  let id: String
  let role: String
  let status: String
  let workspace: AfilmorySessionWorkspace
}

struct AfilmoryRequestedMembership: Codable, Equatable, Sendable {
  let id: String
  let role: String
  let status: String
}

enum WorkspaceSetupMode: Equatable, Sendable {
  case create
  case waiting(name: String, slug: String)
}

enum AfilmoryRootPresentation: Equatable, Sendable {
  case loading
  case visitor
  case workspaceSetup
  case authenticatedTabs
}

struct AfilmorySession: Codable, Equatable, Sendable {
  let user: AfilmorySessionUser
  let activeWorkspace: AfilmorySessionWorkspace?
  let requestedWorkspace: AfilmorySessionWorkspace?
  let requestedMembership: AfilmoryRequestedMembership?
  let memberships: [AfilmorySessionMembership]
  let activeMembership: AfilmorySessionMembership?

  var hasUsableWorkspace: Bool {
    activeWorkspace?.status == "active"
  }

  var workspaceSetupMode: WorkspaceSetupMode? {
    guard !hasUsableWorkspace else { return nil }
    if let workspace = activeWorkspace {
      return .waiting(name: workspace.name, slug: workspace.slug)
    }
    return .create
  }
}

struct AfilmorySessionResponse: Decodable, Sendable {
  let user: AfilmorySessionUser?
  let activeWorkspace: AfilmorySessionWorkspace?
  let requestedWorkspace: AfilmorySessionWorkspace?
  let requestedMembership: AfilmoryRequestedMembership?
  let memberships: [AfilmorySessionMembership]?

  func resolved() -> AfilmorySession? {
    guard let user else { return nil }
    let memberships = memberships ?? []
    let activeMembership = activeWorkspace.flatMap { workspace in
      memberships.first {
        $0.status == "active" && $0.workspace.id == workspace.id
      }
    }
    return AfilmorySession(
      user: user,
      activeWorkspace: activeWorkspace,
      requestedWorkspace: requestedWorkspace,
      requestedMembership: requestedMembership,
      memberships: memberships,
      activeMembership: activeMembership
    )
  }
}

enum AfilmorySessionState: Equatable, Sendable {
  case loading
  case signedIn(AfilmorySession)
  case signedOut
  case failed(String)

  var status: String {
    switch self {
    case .loading:
      "loading"
    case .signedIn:
      "signedIn"
    case .signedOut:
      "signedOut"
    case .failed:
      "failed"
    }
  }

  var session: AfilmorySession? {
    guard case .signedIn(let session) = self else { return nil }
    return session
  }

  var rootPresentation: AfilmoryRootPresentation {
    switch self {
    case .loading:
      .loading
    case .signedOut, .failed:
      .visitor
    case .signedIn(let session):
      session.hasUsableWorkspace ? .authenticatedTabs : .workspaceSetup
    }
  }

  var shouldApplyPendingDeepLink: Bool {
    switch rootPresentation {
    case .visitor, .authenticatedTabs:
      true
    case .loading, .workspaceSetup:
      false
    }
  }

  var shouldPresentTestFlightPrompt: Bool {
    shouldApplyPendingDeepLink
  }
}

final class AfilmorySessionObservationToken {
  private var cancellation: (() -> Void)?

  init(cancellation: @escaping () -> Void) {
    self.cancellation = cancellation
  }

  func cancel() {
    cancellation?()
    cancellation = nil
  }

  deinit {
    cancel()
  }
}
