import XCTest
import GRDB
@testable import Afilmory

final class PhotoReplicaSyncTests: XCTestCase {
  func testContiguousUpsertAdvancesCursorAndPublishesPhoto() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    let change = makeChange(revision: 1, photoId: "p1")

    let result = try repository.apply(slug: "acme", tenantId: "t1", change: change)
    let state = try repository.state(for: "acme")
    let photos = try repository.publishedPhotos(for: "acme")

    XCTAssertEqual(result.advancedTo, 1)
    XCTAssertFalse(result.needsReconcile)
    XCTAssertEqual(state?.contiguousRevision, 1)
    XCTAssertEqual(photos.map(\.id), ["p1"])
  }

  func testDuplicateRevisionIsIgnored() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    let change = makeChange(revision: 1, photoId: "p1")
    _ = try repository.apply(slug: "acme", tenantId: "t1", change: change)
    let second = try repository.apply(slug: "acme", tenantId: "t1", change: change)

    XCTAssertNil(second.advancedTo)
    XCTAssertFalse(second.needsReconcile)
    XCTAssertEqual(try repository.state(for: "acme")?.contiguousRevision, 1)
  }

  func testGapKeepsWriteThroughButDoesNotAdvanceCursor() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    _ = try repository.apply(slug: "acme", tenantId: "t1", change: makeChange(revision: 1, photoId: "p1"))
    let gapped = try repository.apply(slug: "acme", tenantId: "t1", change: makeChange(revision: 4, photoId: "p4"))

    XCTAssertNil(gapped.advancedTo)
    XCTAssertTrue(gapped.needsReconcile)
    XCTAssertEqual(try repository.state(for: "acme")?.contiguousRevision, 1)
    XCTAssertEqual(try repository.publishedPhotos(for: "acme").map(\.id).sorted(), ["p1", "p4"])
  }

  func testDeleteRemovesPhotoAndAdvancesWhenContiguous() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    _ = try repository.apply(slug: "acme", tenantId: "t1", change: makeChange(revision: 1, photoId: "p1"))
    let deletion = PhotoChange(
      tenantId: "t1",
      revision: 2,
      operation: .delete,
      photoId: "p1",
      assetId: "a1",
      published: false,
      photo: nil,
      asset: nil
    )

    let result = try repository.apply(slug: "acme", tenantId: "t1", change: deletion)

    XCTAssertEqual(result.advancedTo, 2)
    XCTAssertTrue(try repository.publishedPhotos(for: "acme").isEmpty)
  }

  func testUnpublishedChangeStaysOffHomeProjection() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    var change = makeChange(revision: 1, photoId: "draft")
    change = PhotoChange(
      tenantId: change.tenantId,
      revision: change.revision,
      operation: change.operation,
      photoId: change.photoId,
      assetId: change.assetId,
      published: false,
      photo: change.photo,
      asset: change.asset
    )

    _ = try repository.apply(slug: "acme", tenantId: "t1", change: change)

    XCTAssertTrue(try repository.publishedPhotos(for: "acme").isEmpty)
    XCTAssertEqual(try repository.studioPhotos(for: "acme").map(\.asset.photoId), ["draft"])
  }

  func testWipeRemovesReplicaState() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    _ = try repository.apply(slug: "acme", tenantId: "t1", change: makeChange(revision: 1, photoId: "p1"))
    try repository.wipeAll()

    XCTAssertNil(try repository.state(for: "acme"))
    XCTAssertTrue(try repository.publishedPhotos(for: "acme").isEmpty)
  }

  func testV2MigrationCanonicalizesPayloadAndRepairsProjections() throws {
    let queue = try DatabaseQueue()
    let migrator = PhotoReplicaMigrations.makeMigrator()
    try migrator.migrate(queue, upTo: PhotoReplicaMigrations.initialSchema)

    let legacyPhoto = GalleryPhoto(
      id: "legacy",
      title: "Legacy",
      description: "",
      originalUrl: "https://example.com/legacy.jpg",
      thumbnailUrl: "https://example.com/legacy.jpg",
      thumbHash: nil,
      aspectRatio: 1,
      width: 1,
      height: 1,
      format: "jpg",
      size: 1,
      dateTaken: nil,
      video: nil,
      tags: [],
      exif: GalleryExif(values: [
        "make": .string("FUJIFILM"),
        "model": .string("X-T5"),
        "lens_model": .string("17-70mm"),
        "rating": .number(4),
        "gps_latitude": .number(35.7109),
        "gps_latitude_ref": .string("N"),
        "gps_longitude": .number(139.7959),
        "gps_longitude_ref": .string("W"),
        "fuji_recipe": .object(["film_mode": .string("Classic Negative")]),
      ]),
      toneAnalysis: nil,
      location: nil,
      camera: nil,
      lens: nil,
      rating: nil,
      city: nil
    )
    try queue.write { db in
      try db.execute(
        sql: """
          INSERT INTO photos (
            tenant_slug, photo_id, published, tags_json, payload, applied_revision
          ) VALUES (?, ?, 1, '[]', ?, 0)
          """,
        arguments: ["acme", legacyPhoto.id, try JSONEncoder().encode(legacyPhoto)]
      )
    }

    let store = PhotoReplicaStore(queue: queue)
    let migratedPhoto = try XCTUnwrap(PhotoReplicaRepository(store: store).publishedPhotos(for: "acme").first)
    let projection = try store.queue.read { db in
      try Row.fetchOne(db, sql: "SELECT * FROM photos WHERE photo_id = 'legacy'")
    }

    XCTAssertEqual(migratedPhoto.exif?["GPSLatitude"]?.number, 35.7109)
    XCTAssertEqual(migratedPhoto.exif?["GPSLongitude"]?.number, 139.7959)
    XCTAssertEqual(migratedPhoto.exif?["FujiRecipe"]?.object?["FilmMode"]?.string, "Classic Negative")
    XCTAssertNil(migratedPhoto.exif?.values["gps_latitude"])
    XCTAssertEqual(migratedPhoto.camera, "FUJIFILM X-T5")
    XCTAssertEqual(migratedPhoto.lens, "17-70mm")
    XCTAssertEqual(migratedPhoto.rating, 4)
    XCTAssertEqual(projection?["latitude"] as Double?, 35.7109)
    XCTAssertEqual(projection?["longitude"] as Double?, -139.7959)
  }

  func testNestedUploadEventYieldsCommittedChange() {
    let event: [String: Any] = [
      "type": "action",
      "payload": [
        "stage": "missing-in-db",
        "index": 1,
        "change": [
          "tenantId": "t1",
          "revision": 3,
          "operation": "upsert",
          "photoId": "p3",
          "assetId": "a-p3",
          "published": true,
          "photo": [
            "id": "p3",
            "title": "p3",
            "originalUrl": "https://example.com/p3.jpg",
            "thumbnailUrl": "https://example.com/p3.jpg",
            "width": 1,
            "height": 1,
          ],
          "asset": [
            "id": "a-p3",
            "photoId": "p3",
            "storageKey": "p3.jpg",
            "storageProvider": "s3",
            "syncStatus": "synced",
            "size": 1,
            "createdAt": "2026-08-29T00:00:00.000Z",
            "updatedAt": "2026-08-29T00:00:00.000Z",
            "syncedAt": "2026-08-29T00:00:00.000Z",
            "publicUrl": "https://example.com/p3.jpg",
          ],
        ],
      ],
    ]

    let changes = PhotoChangeDecoding.changes(from: event)
    XCTAssertEqual(changes.map(\.photoId), ["p3"])
    XCTAssertEqual(changes.first?.revision, 3)
  }

  @MainActor
  func testSyncEngineBootstrapsThenAppliesDelta() async throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    let transport = FakePhotoSyncTransport(
      snapshot: (1, [NativeFixtureTestSupport.photo(id: "seed")]),
      changes: ManifestChangesResponse(
        revision: 2,
        expired: false,
        changes: [makeChange(revision: 2, photoId: "next")]
      )
    )
    let engine = PhotoSyncEngine(repository: repository, transport: transport)

    engine.ensureSynced(slug: "acme")
    try await waitUntilReplica { (try? repository.state(for: "acme")?.contiguousRevision) == 1 }
    engine.ensureSynced(slug: "acme", force: true)
    try await waitUntilReplica { (try? repository.publishedPhotos(for: "acme").map(\.id).sorted()) == ["next", "seed"] }
  }

  @MainActor
  func testExpiredCursorRebuildsFromSnapshot() async throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    let transport = FakePhotoSyncTransport(
      snapshot: (9, [NativeFixtureTestSupport.photo(id: "fresh")]),
      changes: ManifestChangesResponse(revision: 9, expired: true, changes: [])
    )
    try repository.replaceSnapshot(
      slug: "acme",
      tenantId: "t1",
      revision: 1,
      photos: [NativeFixtureTestSupport.photo(id: "stale")],
      assets: []
    )
    let engine = PhotoSyncEngine(repository: repository, transport: transport)

    engine.ensureSynced(slug: "acme", force: true)
    try await waitUntilReplica { (try? repository.state(for: "acme")?.contiguousRevision) == 9 }
    XCTAssertEqual(try repository.publishedPhotos(for: "acme").map(\.id), ["fresh"])
  }

  @MainActor
  func testUnauthorizedSyncWipesReplica() async throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    try repository.replaceSnapshot(
      slug: "acme",
      tenantId: "t1",
      revision: 1,
      photos: [NativeFixtureTestSupport.photo(id: "keep")],
      assets: []
    )
    let transport = FakePhotoSyncTransport(
      snapshot: (1, []),
      changes: ManifestChangesResponse(revision: 1, expired: false, changes: []),
      error: APIError.unauthorized
    )
    let engine = PhotoSyncEngine(repository: repository, transport: transport)

    engine.ensureSynced(slug: "acme", force: true)
    try await waitUntilReplica { (try? repository.state(for: "acme")) == nil }
  }
}

private func makeChange(revision: Int, photoId: String) -> PhotoChange {
    PhotoChange(
      tenantId: "t1",
      revision: revision,
      operation: .upsert,
      photoId: photoId,
      assetId: "a-\(photoId)",
      published: true,
      photo: ManifestPhoto(
        id: photoId,
        title: photoId,
        description: "",
        originalUrl: "https://example.com/\(photoId).jpg",
        thumbnailUrl: "https://example.com/\(photoId).jpg",
        thumbHash: nil,
        width: 1,
        height: 1,
        aspectRatio: 1,
        format: "jpg",
        size: 1,
        dateTaken: "2026-08-29T00:00:00.000Z",
        video: nil,
        tags: [],
        exif: nil,
        toneAnalysis: nil,
        location: nil
      ),
      asset: PhotoChangeAsset(
        id: "a-\(photoId)",
        photoId: photoId,
        storageKey: "\(photoId).jpg",
        storageProvider: "s3",
        syncStatus: "synced",
        size: 1,
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
        syncedAt: "2026-08-29T00:00:00.000Z",
        publicUrl: "https://example.com/\(photoId).jpg"
      )
    )
}

private func waitUntilReplica(
  timeout: TimeInterval = 2,
  _ condition: @Sendable () async -> Bool
) async throws {
  let deadline = Date().addingTimeInterval(timeout)
  while await !condition() {
    if Date() >= deadline {
      XCTFail("Timed out waiting for replica condition")
      return
    }
    try await Task.sleep(nanoseconds: 10_000_000)
  }
}

private struct FakePhotoSyncTransport: PhotoSyncTransport {
  let snapshot: (Int, [GalleryPhoto])
  let changes: ManifestChangesResponse
  var error: Error?

  func fetchSnapshot(slug: String) async throws -> (revision: Int, photos: [GalleryPhoto]) {
    if let error { throw error }
    return snapshot
  }

  func fetchChanges(slug: String, after: Int) async throws -> ManifestChangesResponse {
    if let error { throw error }
    return changes
  }

  func fetchStudioAssets() async throws -> [StudioAsset] {
    if let error { throw error }
    return []
  }
}
