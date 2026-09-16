import SwiftUI

struct ShareTagChipRow: View {
  let labels: [String]
  let selected: Bool
  let onTap: (String) -> Void

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 8) {
        ForEach(labels, id: \.self) { label in
          Button {
            onTap(label)
          } label: {
            HStack(spacing: 4) {
              Text(label)
              if selected {
                Image(systemName: "xmark")
                  .font(.system(size: 9, weight: .bold))
              }
            }
            .font(.footnote.weight(selected ? .semibold : .regular))
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          .tint(selected ? .accentColor : .secondary)
        }
      }
      .padding(.horizontal, 1)
    }
    .scrollIndicators(.hidden)
  }
}
