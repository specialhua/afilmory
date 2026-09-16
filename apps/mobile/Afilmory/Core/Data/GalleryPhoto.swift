import Foundation

enum JSONValue: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: JSONValue].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null:
      try container.encodeNil()
    case .bool(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .string(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    }
  }

  var string: String? {
    guard case .string(let value) = self else { return nil }
    return value
  }

  var number: Double? {
    guard case .number(let value) = self else { return nil }
    return value
  }

  var object: [String: JSONValue]? {
    guard case .object(let value) = self else { return nil }
    return value
  }
}

struct GalleryExif: Codable, Equatable, Sendable {
  let values: [String: JSONValue]

  init(values: [String: JSONValue] = [:]) {
    self.values = values
  }

  init(from decoder: Decoder) throws {
    values = try decoder.singleValueContainer().decode([String: JSONValue].self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(values)
  }

  subscript(_ key: String) -> JSONValue? {
    values[key]
  }

  init(responseValues: [String: JSONValue]) {
    values = Self.normalizeResponseObject(responseValues)
  }

  private static let responseKeys: [String: String] = {
    let canonicalKeys = [
      "zone", "tz", "tzSource",
      "Orientation", "Make", "Model", "Software", "Artist", "Copyright",
      "ExposureTime", "FNumber", "ExposureProgram", "ISO", "ShutterSpeedValue",
      "ApertureValue", "BrightnessValue", "ExposureCompensationSet",
      "ExposureCompensationMode", "ExposureCompensationSetting", "ExposureCompensation",
      "MaxApertureValue", "OffsetTime", "OffsetTimeOriginal", "OffsetTimeDigitized",
      "LightSource", "Flash", "FocalLength", "FocalLengthIn35mmFormat", "LensMake",
      "LensModel", "ColorSpace", "ExposureMode", "SceneCaptureType", "Aperture",
      "ScaleFactor35efl", "ShutterSpeed", "LightValue", "DateTimeOriginal",
      "DateTimeDigitized", "ImageWidth", "ImageHeight", "MeteringMode", "WhiteBalance",
      "WBShiftAB", "WBShiftGM", "WhiteBalanceBias", "FlashMeteringMode", "SensingMethod",
      "FocalPlaneXResolution", "FocalPlaneYResolution", "GPSAltitude", "GPSCoordinates",
      "GPSAltitudeRef", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef",
      "FujiRecipe", "SonyRecipe", "MPImageType", "UniformResourceName", "Rating",
      "MotionPhoto", "MotionPhotoVersion", "MotionPhotoPresentationTimestampUs",
      "ContainerDirectory", "MicroVideo", "MicroVideoVersion", "MicroVideoOffset",
      "MicroVideoPresentationTimestampUs", "Subject", "Keywords", "WeightedFlatSubject",
      "HierarchicalSubject", "RegionInfo",
      "FilmMode", "GrainEffectRoughness", "GrainEffectSize", "ColorChromeEffect",
      "ColorChromeFxBlue", "WhiteBalanceFineTune", "DynamicRange", "HighlightTone",
      "ShadowTone", "Saturation", "Sharpness", "NoiseReduction", "Clarity",
      "ColorTemperature", "DevelopmentDynamicRange", "DynamicRangeSetting",
      "CreativeStyle", "PictureEffect", "Hdr", "SoftSkinEffect",
      "AppliedToDimensions", "RegionList", "Name", "Type", "Area", "W", "H", "Unit", "X", "Y",
    ]
    return APIResponseDecoding.keyMap(for: canonicalKeys)
  }()

  private static func normalizeResponseObject(_ object: [String: JSONValue]) -> [String: JSONValue] {
    var normalized: [String: JSONValue] = [:]
    normalized.reserveCapacity(object.count)
    for (key, value) in object {
      let canonicalKey = APIResponseDecoding.canonicalKey(key, using: responseKeys)
      if key == canonicalKey || normalized[canonicalKey] == nil {
        normalized[canonicalKey] = normalizeResponseValue(value)
      }
    }
    return normalized
  }

  private static func normalizeResponseValue(_ value: JSONValue) -> JSONValue {
    switch value {
    case .array(let values):
      .array(values.map(normalizeResponseValue))
    case .object(let object):
      .object(normalizeResponseObject(object))
    default:
      value
    }
  }
}

struct GalleryLocation: Codable, Equatable, Sendable {
  let latitude: Double?
  let longitude: Double?
  let country: String?
  let city: String?
  let locationName: String?
}

struct GalleryToneAnalysis: Codable, Equatable, Sendable {
  let toneType: String
  let brightness: Double
  let contrast: Double
  let shadowRatio: Double
  let highlightRatio: Double
}

enum GalleryVideoSource: Codable, Equatable, Sendable {
  case livePhoto(videoUrl: String)
  case motionPhoto(offset: Double, size: Double?, presentationTimestamp: Double?)

  private enum CodingKeys: String, CodingKey {
    case type
    case videoUrl
    case offset
    case size
    case presentationTimestamp
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(String.self, forKey: .type) {
    case "live-photo":
      self = .livePhoto(videoUrl: try container.decode(String.self, forKey: .videoUrl))
    case "motion-photo":
      self = .motionPhoto(
        offset: try container.decode(Double.self, forKey: .offset),
        size: try container.decodeIfPresent(Double.self, forKey: .size),
        presentationTimestamp: try container.decodeIfPresent(Double.self, forKey: .presentationTimestamp)
      )
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .type,
        in: container,
        debugDescription: "Unsupported video source"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .livePhoto(let videoUrl):
      try container.encode("live-photo", forKey: .type)
      try container.encode(videoUrl, forKey: .videoUrl)
    case .motionPhoto(let offset, let size, let presentationTimestamp):
      try container.encode("motion-photo", forKey: .type)
      try container.encode(offset, forKey: .offset)
      try container.encodeIfPresent(size, forKey: .size)
      try container.encodeIfPresent(presentationTimestamp, forKey: .presentationTimestamp)
    }
  }

  var livePhotoVideoURL: String? {
    guard case .livePhoto(let videoUrl) = self else { return nil }
    return videoUrl
  }
}

struct GalleryPhoto: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  let description: String
  let originalUrl: String
  let thumbnailUrl: String
  let thumbHash: String?
  let aspectRatio: Double
  let width: Double
  let height: Double
  let format: String?
  let size: Double?
  let dateTaken: String?
  let video: GalleryVideoSource?
  let tags: [String]
  let exif: GalleryExif?
  let toneAnalysis: GalleryToneAnalysis?
  let location: GalleryLocation?
  let camera: String?
  let lens: String?
  let rating: Int?
  let city: String?
}
