import Foundation

struct PhotoReactionTally: Equatable, Sendable {
  let count: Int
  let deadline: TimeInterval
  let reaction: String
}

struct PhotoReactionFlush: Equatable, Sendable {
  let count: Int
  let reaction: String
}

struct PhotoReactionTallyStep: Equatable, Sendable {
  let flush: PhotoReactionFlush?
  let tally: PhotoReactionTally?
}

enum PhotoReactionTallyEngine {
  static let mergeWindow: TimeInterval = 0.8

  static func accumulate(
    current: PhotoReactionTally?,
    reaction: String,
    count: Int,
    now: TimeInterval,
    window: TimeInterval = mergeWindow
  ) -> PhotoReactionTallyStep {
    guard count > 0 else { return PhotoReactionTallyStep(flush: nil, tally: current) }
    let extendsCurrent = current?.reaction == reaction && now < (current?.deadline ?? 0)
    return PhotoReactionTallyStep(
      flush: extendsCurrent ? nil : current.map { PhotoReactionFlush(count: $0.count, reaction: $0.reaction) },
      tally: PhotoReactionTally(
        count: extendsCurrent ? (current?.count ?? 0) + count : count,
        deadline: now + window,
        reaction: reaction
      )
    )
  }

  static func expire(current: PhotoReactionTally?, now: TimeInterval) -> PhotoReactionTallyStep {
    guard let current, now >= current.deadline else {
      return PhotoReactionTallyStep(flush: nil, tally: current)
    }
    return PhotoReactionTallyStep(
      flush: PhotoReactionFlush(count: current.count, reaction: current.reaction),
      tally: nil
    )
  }

  static func drain(current: PhotoReactionTally?) -> PhotoReactionTallyStep {
    PhotoReactionTallyStep(
      flush: current.map { PhotoReactionFlush(count: $0.count, reaction: $0.reaction) },
      tally: nil
    )
  }
}
