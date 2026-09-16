import Foundation

enum DateRange {
  static func visibleMonthAnchor(
    photos: [GalleryPhoto],
    startIndex: Int,
    endIndex: Int,
    localeIdentifier: String,
    now: Date = .now,
    timeZone: TimeZone = .current
  ) -> String? {
    guard !photos.isEmpty else { return nil }
    let start = max(0, min(startIndex, photos.count - 1))
    let end = max(start, min(endIndex, photos.count - 1))
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    var counts: [Int: Int] = [:]
    for photo in photos[start...end] {
      guard let value = photo.dateTaken,
            let date = PhotoDateParser.date(value, timeZone: timeZone)
      else { continue }
      let year = calendar.component(.year, from: date)
      let month = calendar.component(.month, from: date) - 1
      counts[year * 12 + month, default: 0] += 1
    }
    guard let anchor = counts.keys.max(by: { lhs, rhs in
      let leftCount = counts[lhs] ?? 0
      let rightCount = counts[rhs] ?? 0
      return leftCount == rightCount ? lhs < rhs : leftCount < rightCount
    }) else { return nil }
    let year = anchor / 12
    let month = anchor % 12 + 1
    var components = DateComponents()
    components.calendar = calendar
    components.timeZone = timeZone
    components.year = year
    components.month = month
    components.day = 1
    guard let date = components.date else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.timeZone = timeZone
    let includeYear = year != calendar.component(.year, from: now)
    formatter.setLocalizedDateFormatFromTemplate(includeYear ? "yMMMM" : "MMMM")
    return formatter.string(from: date)
  }
}
