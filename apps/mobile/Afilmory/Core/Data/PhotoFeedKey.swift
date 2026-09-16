import Foundation

enum PhotoFeedKey: Hashable, Sendable {
  case manifest(String)
  case studioLibrary

  init?(rawValue: String) {
    if rawValue == "studio" {
      self = .studioLibrary
      return
    }
    guard rawValue.hasPrefix("manifest:") else { return nil }
    let slug = String(rawValue.dropFirst("manifest:".count))
    guard !slug.isEmpty else { return nil }
    self = .manifest(slug)
  }

  var rawValue: String {
    switch self {
    case .manifest(let slug):
      "manifest:\(slug)"
    case .studioLibrary:
      "studio"
    }
  }
}
