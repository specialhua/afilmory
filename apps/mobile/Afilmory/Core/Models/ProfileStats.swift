import Foundation

struct ProfileStats: Codable, Equatable, Sendable {
  let photoCount: Int
  let cameraCount: Int
  let lensCount: Int
  let yearSpan: String?

  static func collect(_ photos: [GalleryPhoto], timeZone: TimeZone = .current) -> ProfileStats {
    var cameras = Set<String>()
    var lenses = Set<String>()
    var years: [Int] = []
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    for photo in photos {
      if let camera = photo.camera { cameras.insert(camera) }
      if let lens = photo.lens { lenses.insert(lens) }
      if let value = photo.dateTaken, let date = PhotoDateParser.date(value, timeZone: timeZone) {
        years.append(calendar.component(.year, from: date))
      }
    }
    let minimum = years.min()
    let maximum = years.max()
    let yearSpan: String?
    if let minimum, let maximum {
      yearSpan = minimum == maximum ? String(minimum) : "\(minimum)–\(maximum)"
    } else {
      yearSpan = nil
    }
    return ProfileStats(
      photoCount: photos.count,
      cameraCount: cameras.count,
      lensCount: lenses.count,
      yearSpan: yearSpan
    )
  }
}
