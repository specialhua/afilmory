import Foundation

struct ManifestEnvelope: Decodable, Sendable {
  let data: [ManifestPhoto]
}

struct ManifestExif: Decodable, Sendable {
  let value: GalleryExif

  init(from decoder: Decoder) throws {
    let values = try decoder.singleValueContainer().decode([String: JSONValue].self)
    value = GalleryExif(responseValues: values)
  }
}

struct ManifestVideo: Decodable, Sendable {
  let type: String
  let videoUrl: String?
  let offset: Double?
  let size: Double?
  let presentationTimestamp: Double?
}

struct ManifestPhoto: Decodable, Sendable {
  let id: String
  let title: String?
  let description: String?
  let originalUrl: String?
  let thumbnailUrl: String?
  let thumbHash: String?
  let width: Double?
  let height: Double?
  let aspectRatio: Double?
  let format: String?
  let size: Double?
  let dateTaken: String?
  let video: ManifestVideo?
  let tags: [String]?
  let exif: ManifestExif?
  let toneAnalysis: GalleryToneAnalysis?
  let location: GalleryLocation?
}

enum ManifestDecoding {
  static func decode(_ data: Data, galleryOrigin: URL) throws -> [GalleryPhoto] {
    let envelope = try APIResponseDecoding.decode(ManifestEnvelope.self, from: data)
    return normalize(envelope.data, galleryOrigin: galleryOrigin)
  }

  static func normalize(_ photos: [ManifestPhoto], galleryOrigin: URL) -> [GalleryPhoto] {
    photos.enumerated()
      .filter { !$0.element.thumbnailUrl.trimmingToNil.isNil }
      .sorted { lhs, rhs in
        let left = lhs.element.dateTaken ?? ""
        let right = rhs.element.dateTaken ?? ""
        return left == right ? lhs.offset < rhs.offset : left > right
      }
      .compactMap { normalize($0.element, galleryOrigin: galleryOrigin) }
  }

  private static func normalize(_ photo: ManifestPhoto, galleryOrigin: URL) -> GalleryPhoto? {
    guard let thumbnailUrl = photo.thumbnailUrl?.trimmingToNil else { return nil }
    let width = photo.width ?? 0
    let height = photo.height ?? 0
    let exif = photo.exif?.value

    return GalleryPhoto(
      id: photo.id,
      title: photo.title ?? "",
      description: photo.description ?? "",
      originalUrl: photo.originalUrl?.trimmingToNil ?? thumbnailUrl,
      thumbnailUrl: thumbnailUrl,
      thumbHash: photo.thumbHash,
      aspectRatio: photo.aspectRatio ?? (width != 0 && height != 0 ? width / height : 1),
      width: width,
      height: height,
      format: photo.format,
      size: photo.size,
      dateTaken: photo.dateTaken,
      video: normalizeVideo(photo.video, baseURL: galleryOrigin),
      tags: photo.tags ?? [],
      exif: exif,
      toneAnalysis: photo.toneAnalysis,
      location: photo.location,
      camera: camera(from: exif),
      lens: lens(from: exif),
      rating: rating(from: exif),
      city: photo.location?.city ?? photo.location?.locationName
    )
  }

  static func camera(from exif: GalleryExif?) -> String? {
    let make = exif?["Make"]?.string?.trimmingToNil
    let model = exif?["Model"]?.string?.trimmingToNil
    if let make, let model {
      return model.lowercased().hasPrefix(make.lowercased()) ? model : "\(make) \(model)"
    }
    return make ?? model
  }

  static func lens(from exif: GalleryExif?) -> String? {
    exif?["LensModel"]?.string?.trimmingToNil
  }

  static func rating(from exif: GalleryExif?) -> Int? {
    exif?["Rating"]?.number.map { min(5, max(0, Int($0.rounded()))) }
  }

  static func normalizeVideo(_ value: ManifestVideo?, baseURL: URL?) -> GalleryVideoSource? {
    guard let value else { return nil }
    if value.type == "live-photo",
       let raw = value.videoUrl?.trimmingToNil,
       let url = URL(string: raw, relativeTo: baseURL)?.absoluteURL,
       url.scheme == "http" || url.scheme == "https"
    {
      return .livePhoto(videoUrl: url.absoluteString)
    }
    if value.type == "motion-photo", let offset = value.offset, offset >= 0 {
      let size = value.size.flatMap { $0 >= 0 ? $0 : nil }
      return .motionPhoto(offset: offset, size: size, presentationTimestamp: value.presentationTimestamp)
    }
    return nil
  }

  static func normalizeVideo(_ value: JSONValue?, baseURL: URL?) -> GalleryVideoSource? {
    guard let object = value?.object, let type = object["type"]?.string else { return nil }
    if type == "live-photo",
       let raw = (object["videoUrl"] ?? object["video_url"])?.string?.trimmingToNil,
       let url = URL(string: raw, relativeTo: baseURL)?.absoluteURL,
       url.scheme == "http" || url.scheme == "https"
    {
      return .livePhoto(videoUrl: url.absoluteString)
    }
    if type == "motion-photo", let offset = object["offset"]?.number, offset >= 0 {
      let size = object["size"]?.number.flatMap { $0 >= 0 ? $0 : nil }
      return .motionPhoto(
        offset: offset,
        size: size,
        presentationTimestamp: object["presentationTimestamp"]?.number
      )
    }
    return nil
  }
}

private extension Optional where Wrapped == String {
  var trimmingToNil: String? {
    self?.trimmingToNil
  }

  var isNil: Bool {
    self == nil
  }
}

extension String {
  var trimmingToNil: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
