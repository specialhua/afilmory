import Foundation

enum WorkspaceSlugCheck: Equatable, Sendable {
  case available(String)
  case unavailable(String)
}

enum WorkspaceSlugResolver {
  static let minimumLength = 3

  static func candidates(base: String, limit: Int = 20) -> [String] {
    let normalized = WorkspaceOnboardingDefaults.normalizeSlug(base)
    guard normalized.count >= minimumLength else { return [] }
    let suffixCount = max(limit - 1, 0)
    return [normalized] + (2..<(2 + suffixCount)).map { "\(normalized)-\($0)" }
  }

  static func firstAvailable(
    base: String,
    limit: Int = 20,
    check: (String) async throws -> WorkspaceSlugCheck
  ) async throws -> String? {
    for candidate in candidates(base: base, limit: limit) {
      switch try await check(candidate) {
      case .available(let slug):
        return slug
      case .unavailable:
        continue
      }
    }
    return nil
  }
}
