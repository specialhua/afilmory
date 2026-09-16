import SwiftUI

struct CommentSkeletonRowView: View {
  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      Circle()
        .fill(.secondary.opacity(0.25))
        .frame(width: 34, height: 34)
      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 4)
          .fill(.secondary.opacity(0.25))
          .frame(width: 126, height: 12)
        RoundedRectangle(cornerRadius: 4)
          .fill(.secondary.opacity(0.25))
          .frame(height: 14)
        RoundedRectangle(cornerRadius: 4)
          .fill(.secondary.opacity(0.25))
          .frame(width: 190, height: 14)
      }
    }
    .padding(.vertical, 6)
    .redacted(reason: .placeholder)
    .accessibilityHidden(true)
  }
}
