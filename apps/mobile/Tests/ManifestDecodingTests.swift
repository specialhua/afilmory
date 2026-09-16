import XCTest
@testable import Afilmory

final class ManifestDecodingTests: XCTestCase {
  func testDecodesAndNormalizesGoldenManifest() throws {
    let actual = try ManifestDecoding.decode(
      NativeFixtureTestSupport.data("manifest"),
      galleryOrigin: URL(string: "https://innei.afilmory.art")!
    )
    let expected = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    XCTAssertEqual(actual, expected)
  }

  func testResponsePipelineNormalizesCamelAndSnakeCasePayloads() throws {
    let camelData = Data(#"""
      {"data":[{"id":"mapped","title":"Mapped","originalUrl":"https://example.com/photo.jpg","thumbnailUrl":"https://example.com/photo.jpg","width":1,"height":1,"video":{"type":"live-photo","videoUrl":"/live.mov"},"exif":{"Make":"FUJIFILM","Model":"X-T5","LensModel":"17-70mm","Rating":4,"GPSLatitude":35.7109,"GPSLongitude":139.7959,"FujiRecipe":{"FilmMode":"Classic Negative"}}}]}
      """#.utf8)
    let snakeData = Data(#"""
      {"data":[{"id":"mapped","title":"Mapped","original_url":"https://example.com/photo.jpg","thumbnail_url":"https://example.com/photo.jpg","width":1,"height":1,"video":{"type":"live-photo","video_url":"/live.mov"},"exif":{"make":"FUJIFILM","model":"X-T5","lens_model":"17-70mm","rating":4,"gps_latitude":35.7109,"gps_longitude":139.7959,"fuji_recipe":{"film_mode":"Classic Negative"}}}]}
      """#.utf8)

    let origin = URL(string: "https://example.com")!
    let camelPhoto = try XCTUnwrap(ManifestDecoding.decode(camelData, galleryOrigin: origin).first)
    let snakePhoto = try XCTUnwrap(ManifestDecoding.decode(snakeData, galleryOrigin: origin).first)

    XCTAssertEqual(snakePhoto, camelPhoto)
    XCTAssertEqual(snakePhoto.camera, "FUJIFILM X-T5")
    XCTAssertEqual(snakePhoto.lens, "17-70mm")
    XCTAssertEqual(snakePhoto.rating, 4)
    XCTAssertEqual(snakePhoto.exif?["GPSLatitude"]?.number, 35.7109)
    XCTAssertEqual(snakePhoto.exif?["GPSLongitude"]?.number, 139.7959)
    XCTAssertEqual(snakePhoto.exif?["FujiRecipe"]?.object?["FilmMode"]?.string, "Classic Negative")
    XCTAssertNil(snakePhoto.exif?.values["gps_latitude"])
  }
}
