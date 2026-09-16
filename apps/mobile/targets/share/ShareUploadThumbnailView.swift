import SwiftUI

struct ShareUploadThumbnailView: View {
  let item: ShareUploadBatchItem
  let previewURL: URL?
  let removeLabel: String
  let onRemove: () -> Void

  @State private var image: UIImage?

  var body: some View {
    ZStack(alignment: .topTrailing) {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(Color(.tertiarySystemFill))
        .aspectRatio(1, contentMode: .fit)
        .overlay {
          if let image {
            Image(uiImage: image)
              .resizable()
              .scaledToFill()
          } else {
            Image(systemName: "photo")
              .font(.title2)
              .foregroundStyle(.tertiary)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.name)
        .accessibilityAddTraits(.isImage)

      Button(action: onRemove) {
        Image(systemName: "xmark.circle.fill")
          .font(.title3)
          .symbolRenderingMode(.palette)
          .foregroundStyle(.white, .black.opacity(0.58))
      }
      .padding(5)
      .accessibilityLabel(removeLabel)
    }
    .task(id: previewURL) {
      guard let previewURL else { return }
      image = await Task.detached(priority: .userInitiated) {
        UIImage(contentsOfFile: previewURL.path)
      }.value
    }
  }
}
