import XCTest
@testable import Afilmory

final class PhotoTransitionGeometryTests: XCTestCase {
  func testDismissDragFollowsTranslationBeforeRelease() {
    let state = PhotoTransitionGeometry.dismissalDragState(
      translation: CGPoint(x: 24, y: 170)
    )
    XCTAssertEqual(state.progress, 0.5, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation, CGPoint(x: 24, y: 170))
    XCTAssertEqual(state.transform.scale, 0.84, accuracy: 0.0001)
  }

  func testDismissDragContinuesPastCommitDistance() {
    let state = PhotoTransitionGeometry.dismissalDragState(
      translation: CGPoint(x: -18, y: 560)
    )
    XCTAssertEqual(state.progress, 1, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation, CGPoint(x: -18, y: 560))
    XCTAssertEqual(state.transform.scale, 0.68, accuracy: 0.0001)
  }

  func testPinchDismissalScalesAroundItsCentroid() {
    let state = PhotoTransitionGeometry.dismissalPinchState(
      scale: 0.84,
      anchor: CGPoint(x: 100, y: 200),
      location: CGPoint(x: 120, y: 260),
      viewportCenter: CGPoint(x: 200, y: 400)
    )
    XCTAssertEqual(state.progress, 0.5, accuracy: 0.0001)
    XCTAssertEqual(state.transform.scale, 0.84, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation.x, 4, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation.y, 28, accuracy: 0.0001)
  }

  func testPinchDismissalIncludesDownwardCentroidTravel() {
    let state = PhotoTransitionGeometry.dismissalPinchState(
      scale: 1,
      anchor: CGPoint(x: 200, y: 200),
      location: CGPoint(x: 210, y: 370),
      viewportCenter: CGPoint(x: 200, y: 400)
    )
    XCTAssertEqual(state.progress, 0.5, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation, CGPoint(x: 10, y: 170))
  }

  func testDismissalCommitDecisionsUseProgressAndMomentum() {
    XCTAssertTrue(
      PhotoTransitionGeometry.shouldCommitDragDismissal(
        progress: 0.46,
        translationY: 40,
        velocityY: 0
      )
    )
    XCTAssertTrue(
      PhotoTransitionGeometry.shouldCommitDragDismissal(
        progress: 0.2,
        translationY: 120,
        velocityY: 1_300
      )
    )
    XCTAssertFalse(
      PhotoTransitionGeometry.shouldCommitDragDismissal(
        progress: 0.2,
        translationY: 80,
        velocityY: 1_300
      )
    )
    XCTAssertTrue(
      PhotoTransitionGeometry.shouldCommitPinchDismissal(
        progress: 0.5,
        scale: 0.84,
        velocity: 0
      )
    )
    XCTAssertTrue(
      PhotoTransitionGeometry.shouldCommitPinchDismissal(
        progress: 0.2,
        scale: 0.9,
        velocity: -1.5
      )
    )
    XCTAssertFalse(
      PhotoTransitionGeometry.shouldCommitPinchDismissal(
        progress: 0.2,
        scale: 0.95,
        velocity: -1.5
      )
    )
  }

  func testPortraitTransform() throws {
    let result = try XCTUnwrap(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: CGRect(x: 101, y: 120, width: 200, height: 400),
        targetRect: CGRect(x: 20, y: 80, width: 120, height: 240),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertEqual(result.scale, 0.6, accuracy: 0.0001)
    XCTAssertEqual(result.translation.x, -121, accuracy: 0.0001)
    XCTAssertEqual(result.translation.y, -166.8, accuracy: 0.0001)
  }

  func testLandscapeSquareAndExtremeAspectFit() throws {
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 2, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 0, y: 300, width: 400, height: 200)
    )
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 1, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 0, y: 200, width: 400, height: 400)
    )
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 0.1, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 160, y: 0, width: 80, height: 800)
    )
  }

  func testPartiallyOffscreenSource() throws {
    let result = try XCTUnwrap(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: CGRect(x: 0, y: 200, width: 402, height: 300),
        targetRect: CGRect(x: -50, y: -20, width: 180, height: 120),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertTrue(result.scale.isFinite)
    XCTAssertTrue(result.translation.x.isFinite)
    XCTAssertTrue(result.translation.y.isFinite)
  }

  func testDismissTargetMapsCropWindowOntoAspectFillCell() throws {
    let imageSize = CGSize(width: 402, height: 268)
    let cellSize = CGSize(width: 92, height: 116)
    let crop = try XCTUnwrap(
      PhotoTransitionGeometry.aspectFillContentsRect(
        imageSize: imageSize,
        viewportSize: cellSize
      )
    )
    let scale = max(cellSize.width / imageSize.width, cellSize.height / imageSize.height)
    let visibleImageSize = CGSize(
      width: imageSize.width * scale * crop.width,
      height: imageSize.height * scale * crop.height
    )

    XCTAssertEqual(crop.midX, 0.5, accuracy: 0.0001)
    XCTAssertEqual(crop.midY, 0.5, accuracy: 0.0001)
    XCTAssertLessThan(crop.width, 1)
    XCTAssertEqual(crop.height, 1, accuracy: 0.0001)
    XCTAssertEqual(visibleImageSize.width, cellSize.width, accuracy: 0.0001)
    XCTAssertEqual(visibleImageSize.height, cellSize.height, accuracy: 0.0001)
  }

  func testInteractiveDismissImageFrameFollowsDragTransform() {
    let imageFrame = CGRect(x: 0, y: 303, width: 402, height: 268)
    let viewportCenter = CGPoint(x: 201, y: 437)
    let drag = PhotoTransitionGeometry.dismissalDragState(
      translation: CGPoint(x: 18, y: 170)
    )

    let transformed = PhotoTransitionGeometry.transformedRect(
      imageFrame,
      by: drag.transform,
      around: viewportCenter
    )

    XCTAssertEqual(transformed.midX, imageFrame.midX + 18, accuracy: 0.0001)
    XCTAssertEqual(transformed.midY, imageFrame.midY + 170, accuracy: 0.0001)
    XCTAssertEqual(transformed.width, imageFrame.width * drag.transform.scale, accuracy: 0.0001)
    XCTAssertEqual(transformed.height, imageFrame.height * drag.transform.scale, accuracy: 0.0001)
  }

  func testZeroSizeReturnsNil() {
    XCTAssertNil(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: .zero,
        targetRect: CGRect(x: 0, y: 0, width: 100, height: 100),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertNil(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 0, in: CGRect(x: 0, y: 0, width: 10, height: 10)))
  }

}
