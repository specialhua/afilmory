import Foundation

enum PhotoReaction: String, CaseIterable, Codable, Sendable {
  case like = "👍"
  case love = "😍"
  case fire = "🔥"
  case applause = "👏"
  case star = "🌟"
  case celebrate = "🙌"
}

struct PhotoReactionState: Equatable, Sendable {
  var counts: [String: Int]
  var localDeltas: [String: Int]

  init(counts: [String: Int] = [:], localDeltas: [String: Int] = [:]) {
    self.counts = counts
    self.localDeltas = localDeltas
  }

  static func normalize(_ value: JSONValue?) -> [String: Int] {
    guard case .object(let values) = value else { return [:] }
    var counts: [String: Int] = [:]
    for (reaction, value) in values {
      guard case .number(let count) = value, count.isFinite, count > 0 else { continue }
      counts[reaction] = Int(count.rounded(.down))
    }
    return counts
  }

  func adding(_ reaction: PhotoReaction, count: Int) -> PhotoReactionState {
    guard count > 0 else { return self }
    return PhotoReactionState(
      counts: Self.applying(count, to: counts, reaction: reaction.rawValue),
      localDeltas: Self.applying(count, to: localDeltas, reaction: reaction.rawValue)
    )
  }

  func rollingBack(_ reaction: PhotoReaction, count: Int) -> PhotoReactionState {
    guard count > 0 else { return self }
    return PhotoReactionState(
      counts: Self.applying(-count, to: counts, reaction: reaction.rawValue),
      localDeltas: Self.applying(-count, to: localDeltas, reaction: reaction.rawValue)
    )
  }

  func merging(serverCounts: [String: Int]) -> PhotoReactionState {
    var merged = serverCounts.filter { $0.value > 0 }
    for (reaction, delta) in localDeltas {
      merged = Self.applying(delta, to: merged, reaction: reaction)
    }
    return PhotoReactionState(counts: merged, localDeltas: localDeltas)
  }

  private static func applying(
    _ delta: Int,
    to source: [String: Int],
    reaction: String
  ) -> [String: Int] {
    var next = source
    let value = max(0, (next[reaction] ?? 0) + delta)
    if value == 0 {
      next.removeValue(forKey: reaction)
    } else {
      next[reaction] = value
    }
    return next
  }
}
