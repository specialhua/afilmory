import Foundation

struct WorkspaceOnboardingDefaults: Equatable, Sendable {
  let displayName: String
  let workspaceName: String
  let slug: String
  let siteName: String
  let siteTitle: String
  let siteDescription: String

  var siteSettings: [(key: String, value: String)] {
    siteSettings(for: workspaceName)
  }

  func siteSettings(for submittedName: String) -> [(key: String, value: String)] {
    let resolved = submittedName.trimmingCharacters(in: .whitespacesAndNewlines)
    let name = resolved.isEmpty ? siteName : resolved
    return [
      ("site.name", name),
      ("site.title", name),
      ("site.description", siteDescription),
    ]
  }

  static func make(name: String, email: String) -> WorkspaceOnboardingDefaults {
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let emailLocal =
      email.split(separator: "@").first.map(String.init)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let displayName = trimmedName.isEmpty ? emailLocal : trimmedName
    let siteName = siteName(from: displayName)
    return WorkspaceOnboardingDefaults(
      displayName: displayName,
      workspaceName: siteName,
      slug: normalizeSlug(displayName),
      siteName: siteName,
      siteTitle: siteName,
      siteDescription: displayName.isEmpty
        ? ""
        : "A curated photo gallery by \(displayName) on Afilmory."
    )
  }

  static func siteName(from displayName: String) -> String {
    let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }
    let possessive = trimmed.lowercased().hasSuffix("s") ? "\(trimmed)'" : "\(trimmed)'s"
    return "\(possessive) Afilmory"
  }

  static func normalizeSlug(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: "[^a-z0-9-]+", with: "-", options: .regularExpression)
      .replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
      .replacingOccurrences(of: "^-+|-+$", with: "", options: .regularExpression)
  }
}

extension AfilmorySession {
  var workspaceOnboardingDefaults: WorkspaceOnboardingDefaults {
    WorkspaceOnboardingDefaults.make(name: user.name, email: user.email)
  }
}
