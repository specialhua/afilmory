import SwiftUI

enum CommentBubbleMetrics {
  static let maxWidthRatio: CGFloat = 0.82
  static let cornerRadius: CGFloat = 20
  static let tailRadius: CGFloat = 6
  static let horizontalInset: CGFloat = 13
  static let verticalInset: CGFloat = 9
  static let minimumHeight: CGFloat = 38
}

struct CommentBubbleShape: InsettableShape {
  let own: Bool
  var inset: CGFloat = 0

  func inset(by amount: CGFloat) -> CommentBubbleShape {
    var next = self
    next.inset += amount
    return next
  }

  func path(in rect: CGRect) -> Path {
    let radius = CommentBubbleMetrics.cornerRadius - inset
    let tail = CommentBubbleMetrics.tailRadius - inset
    return UnevenRoundedRectangle(
      topLeadingRadius: radius,
      bottomLeadingRadius: own ? radius : tail,
      bottomTrailingRadius: own ? tail : radius,
      topTrailingRadius: radius,
      style: .continuous
    )
    .path(in: rect.insetBy(dx: inset, dy: inset))
  }
}

struct CommentBubbleSurface<Content: View>: View {
  let own: Bool
  @ViewBuilder let content: Content

  @Environment(\.displayScale) private var displayScale

  var body: some View {
    content
      .padding(.horizontal, CommentBubbleMetrics.horizontalInset)
      .padding(.vertical, CommentBubbleMetrics.verticalInset)
      .frame(minHeight: CommentBubbleMetrics.minimumHeight)
      .background {
        if own {
          CommentBubbleShape(own: true).fill(Color.accentColor)
        } else {
          CommentBubbleShape(own: false).fill(Color(.secondarySystemFill))
          CommentBubbleShape(own: false).strokeBorder(Color(.separator), lineWidth: 1 / displayScale)
        }
      }
  }
}

struct CommentBubbleText: View {
  let content: String
  let own: Bool

  init(_ content: String, own: Bool) {
    self.content = content
    self.own = own
  }

  var body: some View {
    Text(attributed)
      .font(.system(size: 14))
      .lineSpacing(3)
      .tint(own ? .white : .accentColor)
      .foregroundStyle(own ? Color.white : Color.primary)
  }

  private var attributed: AttributedString {
    var result = AttributedString(content)
    for match in content.matches(of: /(?:https?:\/\/|www\.)\S+/) {
      guard let range = Range(match.range, in: result) else { continue }
      let raw = String(content[match.range])
      let urlString = raw.hasPrefix("www.") ? "https://\(raw)" : raw
      guard let url = URL(string: urlString) else { continue }
      result[range].link = url
      result[range].underlineStyle = .single
      if own {
        result[range].foregroundColor = .white
      }
    }
    return result
  }
}
