import Foundation

struct StudioAssetManifest: Codable, Equatable, Sendable {
  let version: String
  let data: [String: JSONValue]
}

struct StudioAsset: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let photoId: String
  let storageKey: String
  let storageProvider: String
  let manifest: StudioAssetManifest
  let syncedAt: String
  let updatedAt: String
  let createdAt: String
  let publicUrl: String?
  let size: Double?
  let syncStatus: String
}

struct StudioFeedPhoto: Codable, Equatable, Sendable {
  let photo: GalleryPhoto
  let asset: StudioAsset
}

enum StudioAssetDecoding {
  static func decode(_ data: Data) throws -> [StudioAsset] {
    try APIResponseDecoding.decode([StudioAsset].self, from: data)
  }

  static func normalize(_ assets: [StudioAsset]) -> [StudioFeedPhoto] {
    assets.compactMap { asset in
      normalize(asset).map { StudioFeedPhoto(photo: $0, asset: asset) }
    }
  }

  static func normalize(_ asset: StudioAsset) -> GalleryPhoto? {
    let source = asset.manifest.data
    guard let originalUrl = source.string("originalUrl") ?? asset.publicUrl,
          !originalUrl.isEmpty
    else { return nil }
    let thumbnailUrl = source.string("thumbnailUrl") ?? originalUrl
    guard !thumbnailUrl.isEmpty else { return nil }

    let sourceWidth = source.number("width")
    let sourceHeight = source.number("height")
    let width = sourceWidth.map { $0 > 0 ? $0 : 1 } ?? 1
    let height = sourceHeight.map { $0 > 0 ? $0 : 1 } ?? 1
    let sourceAspectRatio = source.number("aspectRatio")
    let aspectRatio = sourceAspectRatio.map { $0 > 0 ? $0 : width / height } ?? width / height
    let exif = source.object("exif").map { GalleryExif(responseValues: $0) }
    let location = source.object("location").map(GalleryLocation.init)
    let toneAnalysis = source.object("toneAnalysis").flatMap(GalleryToneAnalysis.init)
    let rating = source.number("rating").map(Int.init)

    return GalleryPhoto(
      id: asset.id,
      title: source.string("title") ?? source.string("id") ?? asset.photoId,
      description: source.string("description") ?? "",
      originalUrl: originalUrl,
      thumbnailUrl: thumbnailUrl,
      thumbHash: source.string("thumbHash"),
      aspectRatio: aspectRatio,
      width: width,
      height: height,
      format: source.string("format"),
      size: asset.size ?? source.number("size"),
      dateTaken: source.string("dateTaken"),
      video: ManifestDecoding.normalizeVideo(source["video"], baseURL: URL(string: originalUrl)),
      tags: source.stringArray("tags"),
      exif: exif,
      toneAnalysis: toneAnalysis,
      location: location,
      camera: source.string("camera"),
      lens: source.string("lens"),
      rating: rating,
      city: source.string("city") ?? location?.city
    )
  }
}

private extension Dictionary where Key == String, Value == JSONValue {
  func string(_ key: String) -> String? {
    self[key]?.string
  }

  func number(_ key: String) -> Double? {
    self[key]?.number
  }

  func object(_ key: String) -> [String: JSONValue]? {
    self[key]?.object
  }

  func stringArray(_ key: String) -> [String] {
    guard case .array(let values) = self[key] else { return [] }
    return values.compactMap(\.string)
  }
}

private extension GalleryLocation {
  init(values: [String: JSONValue]) {
    self.init(
      latitude: values["latitude"]?.number,
      longitude: values["longitude"]?.number,
      country: values["country"]?.string,
      city: values["city"]?.string,
      locationName: values["locationName"]?.string
    )
  }
}

private extension GalleryToneAnalysis {
  init?(values: [String: JSONValue]) {
    guard let toneType = values["toneType"]?.string,
          let brightness = values["brightness"]?.number,
          let contrast = values["contrast"]?.number,
          let shadowRatio = values["shadowRatio"]?.number,
          let highlightRatio = values["highlightRatio"]?.number
    else { return nil }
    self.init(
      toneType: toneType,
      brightness: brightness,
      contrast: contrast,
      shadowRatio: shadowRatio,
      highlightRatio: highlightRatio
    )
  }
}
