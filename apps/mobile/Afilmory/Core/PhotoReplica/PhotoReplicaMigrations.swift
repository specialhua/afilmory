import Foundation
import GRDB

enum PhotoReplicaMigrations {
  static let initialSchema = "v1-replica"
  static let canonicalExif = "v2-canonical-exif"

  static func makeMigrator() -> DatabaseMigrator {
    var migrator = DatabaseMigrator()
    migrator.registerMigration(initialSchema) { db in
      try db.execute(sql: """
        CREATE TABLE replica_state (
          tenant_slug TEXT PRIMARY KEY NOT NULL,
          tenant_id TEXT,
          contiguous_revision INTEGER NOT NULL,
          needs_reconcile INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT
        )
        """)
      try db.execute(sql: """
        CREATE TABLE photos (
          tenant_slug TEXT NOT NULL,
          photo_id TEXT NOT NULL,
          asset_id TEXT,
          published INTEGER NOT NULL,
          date_taken TEXT,
          latitude REAL,
          longitude REAL,
          rating INTEGER,
          camera TEXT,
          lens TEXT,
          tags_json TEXT NOT NULL,
          payload BLOB NOT NULL,
          applied_revision INTEGER NOT NULL,
          PRIMARY KEY (tenant_slug, photo_id)
        )
        """)
      try db.execute(sql: """
        CREATE INDEX photos_published_date ON photos(tenant_slug, published, date_taken)
        """)
      try db.execute(sql: """
        CREATE INDEX photos_map ON photos(tenant_slug, latitude, longitude)
        """)
      try db.execute(sql: """
        CREATE TABLE studio_assets (
          tenant_slug TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          photo_id TEXT NOT NULL,
          sync_status TEXT NOT NULL,
          storage_provider TEXT NOT NULL,
          storage_key TEXT NOT NULL,
          size REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT NOT NULL,
          public_url TEXT,
          payload BLOB NOT NULL,
          PRIMARY KEY (tenant_slug, asset_id)
        )
        """)
    }
    migrator.registerMigration(canonicalExif) { db in
      let decoder = JSONDecoder()
      let encoder = JSONEncoder()
      let rows = try Row.fetchAll(db, sql: "SELECT tenant_slug, photo_id, payload FROM photos")

      for row in rows {
        let payload: Data = row["payload"]
        let photo = try decoder.decode(GalleryPhoto.self, from: payload).migratingResponseShape()
        let coordinates = photo.coordinates
        try db.execute(
          sql: """
            UPDATE photos SET
              payload = ?, latitude = ?, longitude = ?, rating = ?, camera = ?, lens = ?
            WHERE tenant_slug = ? AND photo_id = ?
            """,
          arguments: [
            try encoder.encode(photo),
            coordinates?.latitude,
            coordinates?.longitude,
            photo.rating,
            photo.camera,
            photo.lens,
            row["tenant_slug"] as String,
            row["photo_id"] as String,
          ]
        )
      }
    }
    return migrator
  }

}

private extension GalleryPhoto {
  func migratingResponseShape() -> GalleryPhoto {
    let canonicalExif = exif.map { GalleryExif(responseValues: $0.values) }
    return GalleryPhoto(
      id: id,
      title: title,
      description: description,
      originalUrl: originalUrl,
      thumbnailUrl: thumbnailUrl,
      thumbHash: thumbHash,
      aspectRatio: aspectRatio,
      width: width,
      height: height,
      format: format,
      size: size,
      dateTaken: dateTaken,
      video: video,
      tags: tags,
      exif: canonicalExif,
      toneAnalysis: toneAnalysis,
      location: location,
      camera: ManifestDecoding.camera(from: canonicalExif) ?? camera,
      lens: ManifestDecoding.lens(from: canonicalExif) ?? lens,
      rating: ManifestDecoding.rating(from: canonicalExif) ?? rating,
      city: city
    )
  }
}
