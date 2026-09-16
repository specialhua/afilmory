import XCTest

@testable import Afilmory

final class APIErrorTests: XCTestCase {
  func testHttpErrorsPreferTheServerMessageOverRawJSON() {
    let error = APIError.http(
      status: 500,
      body: """
      {"ok":false,"code":6,"message":"Custom domain service is not configured. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_CUSTOM_HOSTNAME_TARGET."}
      """
    )

    XCTAssertEqual(
      error.localizedDescription,
      "Custom domain service is not configured. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_CUSTOM_HOSTNAME_TARGET."
    )
  }
}
