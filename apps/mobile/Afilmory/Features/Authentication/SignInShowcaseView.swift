import SwiftUI

private struct ShowcasePhoto: Identifiable, Hashable {
  let id: String
  let assetName: String
  let aspectRatio: CGFloat
}

private enum SignInShowcaseLibrary {
  static let photos: [ShowcasePhoto] = [
    ShowcasePhoto(id: "DSCF0842", assetName: "signin-DSCF0842", aspectRatio: 2.0 / 3.0),
    ShowcasePhoto(id: "IMG_0030", assetName: "signin-IMG_0030", aspectRatio: 3.0 / 2.0),
    ShowcasePhoto(id: "IMG_5469", assetName: "signin-IMG_5469", aspectRatio: 4.0 / 3.0),
    ShowcasePhoto(id: "DSCF0420", assetName: "signin-DSCF0420", aspectRatio: 2.0 / 3.0),
    ShowcasePhoto(id: "DSCF2853", assetName: "signin-DSCF2853", aspectRatio: 3.0 / 2.0),
    ShowcasePhoto(id: "IMG_5484", assetName: "signin-IMG_5484", aspectRatio: 4.0 / 3.0),
    ShowcasePhoto(id: "DSCF0436", assetName: "signin-DSCF0436", aspectRatio: 2.0 / 3.0),
    ShowcasePhoto(id: "DSCF2848", assetName: "signin-DSCF2848", aspectRatio: 3.0 / 2.0),
    ShowcasePhoto(id: "DSCF2851", assetName: "signin-DSCF2851", aspectRatio: 3.0 / 2.0),
    ShowcasePhoto(id: "IMG_1401", assetName: "signin-IMG_1401", aspectRatio: 3.0 / 4.0),
    ShowcasePhoto(id: "DSCF2850", assetName: "signin-DSCF2850", aspectRatio: 3.0 / 2.0),
  ]
}

private struct ShowcaseColumn: Identifiable {
  struct Item: Identifiable {
    let id: String
    let photo: ShowcasePhoto
    let height: CGFloat
  }

  let id: Int
  let contentHeight: CGFloat
  let duration: TimeInterval
  let items: [Item]
  let width: CGFloat
}

struct SignInShowcaseView: View {
  private static let columnCount = 3
  private static let gap: CGFloat = 6

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { geometry in
      let columns = buildColumns(size: geometry.size)
      if columns.isEmpty {
        LinearGradient(
          colors: [Color(uiColor: .secondarySystemBackground), Color(uiColor: .systemBackground)],
          startPoint: .top,
          endPoint: .bottom
        )
      } else {
        HStack(alignment: .top, spacing: Self.gap) {
          ForEach(columns) { column in
            ShowcaseColumnView(column: column, animated: !reduceMotion)
          }
        }
        .clipped()
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private func buildColumns(size: CGSize) -> [ShowcaseColumn] {
    let photos = SignInShowcaseLibrary.photos
    guard !photos.isEmpty, size.width > 0, size.height > 0 else { return [] }
    let width = (size.width - Self.gap * CGFloat(Self.columnCount - 1)) / CGFloat(Self.columnCount)
    let assigned = (0..<Self.columnCount).map { column in
      photos.enumerated().compactMap { index, photo in index % Self.columnCount == column ? photo : nil }
    }
    let durations: [TimeInterval] = [80, 100, 90]

    return assigned.enumerated().compactMap { columnIndex, columnPhotos in
      guard !columnPhotos.isEmpty else { return nil }
      var contentHeight: CGFloat = 0
      var items: [ShowcaseColumn.Item] = []
      var repetition = 0
      while contentHeight < size.height * 2, items.count < 60 {
        for photo in columnPhotos {
          let ratio = photo.aspectRatio > 0 ? photo.aspectRatio : 1
          let height = width / ratio
          items.append(
            ShowcaseColumn.Item(
              id: "\(photo.id):\(repetition)",
              photo: photo,
              height: height
            )
          )
          contentHeight += height + Self.gap
        }
        repetition += 1
      }
      return ShowcaseColumn(
        id: columnIndex,
        contentHeight: contentHeight,
        duration: durations[columnIndex % durations.count],
        items: items,
        width: width
      )
    }
  }
}

private struct ShowcaseColumnView: View {
  private struct AnimationKey: Hashable {
    let animated: Bool
    let contentHeight: CGFloat
    let duration: TimeInterval
  }

  let column: ShowcaseColumn
  let animated: Bool

  @State private var translation: CGFloat = 0

  var body: some View {
    VStack(spacing: 6) {
      content
      if animated {
        content
      }
    }
    .offset(y: translation)
    .frame(width: column.width, alignment: .top)
    .task(id: animationKey) {
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        translation = 0
      }

      guard animated, column.contentHeight > 0 else { return }
      await Task.yield()
      guard !Task.isCancelled else { return }
      withAnimation(.linear(duration: column.duration).repeatForever(autoreverses: false)) {
        translation = -column.contentHeight
      }
    }
  }

  private var animationKey: AnimationKey {
    AnimationKey(
      animated: animated,
      contentHeight: column.contentHeight,
      duration: column.duration
    )
  }

  private var content: some View {
    VStack(spacing: 6) {
      ForEach(column.items) { item in
        Image(item.photo.assetName)
          .resizable()
          .scaledToFill()
          .frame(width: column.width, height: item.height)
          .clipped()
          .clipShape(.rect(cornerRadius: 6, style: .continuous))
      }
    }
  }
}
