import XCTest

@testable import Afilmory

final class StudioDomainTests: XCTestCase {
  func testListingDecodesBoundDomainsAndCnameTarget() throws {
    let listing = try decodeListing()

    XCTAssertEqual(listing.cnameTarget, "customers.afilmory.art")
    XCTAssertEqual(listing.customDomainLimit, 1)
    XCTAssertEqual(listing.domains.count, 2)
    XCTAssertEqual(listing.domains[0].domain, "photos.ada.com")
    XCTAssertEqual(listing.domains[0].status, .pending)
    XCTAssertEqual(listing.domains[0].hostnameStatus, "pending")
    XCTAssertEqual(listing.domains[0].sslStatus, "pending_validation")
    XCTAssertEqual(
      listing.domains[0].verificationErrors,
      ["custom hostname does not CNAME to this zone."]
    )
    XCTAssertEqual(listing.domains[1].status, .verified)
  }

  func testEmptyAndInvalidHostsAreRejectedBeforeRequest() {
    let listing = StudioDomainListing(
      cnameTarget: "customers.afilmory.art",
      customDomainLimit: 1,
      domains: []
    )

    XCTAssertEqual(StudioDomainPolicy.addDecision(for: "   ", listing: listing), .empty)
    XCTAssertEqual(StudioDomainPolicy.addDecision(for: "ada", listing: listing), .invalid)
  }

  func testAFreePlanShowsUnlockInsteadOfBinding() {
    let listing = StudioDomainListing(
      cnameTarget: "customers.afilmory.art",
      customDomainLimit: 0,
      domains: []
    )

    XCTAssertTrue(StudioDomainPolicy.needsUnlock(listing))
    XCTAssertEqual(
      StudioDomainPolicy.addDecision(for: "photos.ada.com", listing: listing),
      .upgrade(.customDomain(current: 0, limit: 0))
    )
  }

  func testAFilledLimitNeedsAnUpgradeUnlessTheHostIsAlreadyBound() {
    let listing = StudioDomainListing(
      cnameTarget: "customers.afilmory.art",
      customDomainLimit: 1,
      domains: [Self.domain(id: "1", host: "photos.ada.com", status: .pending)]
    )

    XCTAssertEqual(
      StudioDomainPolicy.addDecision(for: "other.ada.com", listing: listing),
      .upgrade(.customDomain(current: 1, limit: 1))
    )
    XCTAssertEqual(
      StudioDomainPolicy.addDecision(for: "https://Photos.Ada.com", listing: listing),
      .request("photos.ada.com")
    )
  }

  func testOnlyPendingDomainsCanBeVerifiedAndUnverifiedRowsShowDNS() {
    let pending = Self.domain(id: "1", host: "photos.ada.com", status: .pending)
    let verified = Self.domain(id: "2", host: "ok.ada.com", status: .verified)
    let disabled = Self.domain(id: "3", host: "old.ada.com", status: .disabled)

    XCTAssertTrue(pending.canVerify)
    XCTAssertFalse(verified.canVerify)
    XCTAssertFalse(disabled.canVerify)
    XCTAssertTrue(pending.showsDNSInstructions)
    XCTAssertFalse(verified.showsDNSInstructions)
    XCTAssertTrue(disabled.showsDNSInstructions)
  }

  private static func domain(
    id: String,
    host: String,
    status: StudioDomainStatus
  ) -> StudioTenantDomain {
    StudioTenantDomain(
      id: id,
      tenantId: "tenant-1",
      domain: host,
      status: status,
      cloudflareHostnameId: nil,
      hostnameStatus: nil,
      sslStatus: nil,
      verificationErrors: [],
      lastSyncedAt: nil,
      verifiedAt: nil,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    )
  }

  private func decodeListing() throws -> StudioDomainListing {
    let data = Data(
      """
      {
        "cname_target": "customers.afilmory.art",
        "custom_domain_limit": 1,
        "domains": [
          {
            "id": "domain-1",
            "tenant_id": "tenant-1",
            "domain": "photos.ada.com",
            "status": "pending",
            "cloudflare_hostname_id": "cf-1",
            "hostname_status": "pending",
            "ssl_status": "pending_validation",
            "verification_errors": ["custom hostname does not CNAME to this zone."],
            "last_synced_at": null,
            "verified_at": null,
            "created_at": "2026-09-01T00:00:00.000Z",
            "updated_at": "2026-09-01T00:00:00.000Z"
          },
          {
            "id": "domain-2",
            "tenant_id": "tenant-1",
            "domain": "ok.ada.com",
            "status": "verified",
            "cloudflare_hostname_id": "cf-2",
            "hostname_status": "active",
            "ssl_status": "active",
            "verification_errors": [],
            "last_synced_at": "2026-09-01T01:00:00.000Z",
            "verified_at": "2026-09-01T01:00:00.000Z",
            "created_at": "2026-09-01T00:00:00.000Z",
            "updated_at": "2026-09-01T01:00:00.000Z"
          }
        ]
      }
      """.utf8
    )
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(StudioDomainListing.self, from: data)
  }
}
