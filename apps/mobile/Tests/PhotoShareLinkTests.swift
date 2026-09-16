import XCTest

@testable import Afilmory

final class PhotoShareLinkTests: XCTestCase {
  func testBuildsGalleryPhotoPermalink() {
    let origin = URL(string: "https://innei.afilmory.art")!
    let url = PhotoShareLink.url(photoId: "DSCF6140", galleryOrigin: origin)

    XCTAssertEqual(url?.absoluteString, "https://innei.afilmory.art/photos/DSCF6140")
  }

  func testTrimsPhotoId() {
    let origin = URL(string: "https://innei.afilmory.art")!
    let url = PhotoShareLink.url(photoId: "  DSCF6140  ", galleryOrigin: origin)

    XCTAssertEqual(url?.absoluteString, "https://innei.afilmory.art/photos/DSCF6140")
  }

  func testRejectsEmptyPhotoId() {
    let origin = URL(string: "https://innei.afilmory.art")!

    XCTAssertNil(PhotoShareLink.url(photoId: "", galleryOrigin: origin))
    XCTAssertNil(PhotoShareLink.url(photoId: "   ", galleryOrigin: origin))
  }

  func testDoesNotUseStorageHost() {
    let origin = URL(string: "https://innei.afilmory.art")!
    let url = PhotoShareLink.url(photoId: "DSCF6140", galleryOrigin: origin)

    XCTAssertFalse(url?.host?.contains("r2.innei.ren") ?? true)
    XCTAssertFalse(url?.absoluteString.contains("originalUrl") ?? true)
    XCTAssertEqual(url?.path, "/photos/DSCF6140")
  }
}
