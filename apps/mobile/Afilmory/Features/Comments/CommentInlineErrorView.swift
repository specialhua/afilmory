import SwiftUI

struct CommentInlineErrorView: View {
  let message: String
  let dismissLabel: String
  let onDismiss: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "exclamationmark.circle.fill")
        .foregroundStyle(.red)
        .accessibilityHidden(true)
      Text(message)
        .font(.footnote)
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(dismissLabel, systemImage: "xmark", action: onDismiss)
        .labelStyle(.iconOnly)
        .buttonStyle(.plain)
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .contain)
  }
}
