import Foundation

extension GalleryPhoto {
  var coordinates: (latitude: Double, longitude: Double)? {
    let latitude = Self.coordinate(
      exif?["GPSLatitude"] ?? location?.latitude.map(JSONValue.number),
      reference: exif?["GPSLatitudeRef"]?.string,
      limit: 90
    )
    let longitude = Self.coordinate(
      exif?["GPSLongitude"] ?? location?.longitude.map(JSONValue.number),
      reference: exif?["GPSLongitudeRef"]?.string,
      limit: 180
    )
    guard let latitude, let longitude else { return nil }
    return (latitude, longitude)
  }

  private static func coordinate(_ value: JSONValue?, reference: String?, limit: Double) -> Double? {
    let number: Double?
    switch value {
    case .number(let value): number = value
    case .string(let value): number = Double(value.trimmingCharacters(in: .whitespacesAndNewlines))
    default: number = nil
    }
    guard let number, number.isFinite, abs(number) <= limit else { return nil }
    let direction = reference?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return ["S", "SOUTH", "W", "WEST"].contains(direction) ? -abs(number) : number
  }
}
