import SwiftUI

struct CommentAvatarView: View {
  let imageURL: String?
  let name: String
  var size: CGFloat = 34

  var body: some View {
    Group {
      if let imageURL, let url = URL(string: imageURL) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          default:
            fallback
          }
        }
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }

  private var fallback: some View {
    ZStack {
      Circle().fill(Color.accentColor.opacity(0.16))
      Text(String(name.trimmingCharacters(in: .whitespacesAndNewlines).first ?? "?"))
        .font(.callout.weight(.semibold))
        .foregroundStyle(.tint)
    }
  }
}
