import Foundation

struct PhotoChangeAsset: Decodable, Sendable {
  let id: String
  let photoId: String
  let storageKey: String
  let storageProvider: String
  let syncStatus: String
  let size: Double?
  let createdAt: String
  let updatedAt: String
  let syncedAt: String
  let publicUrl: String?
}

struct PhotoChange: Decodable, Sendable {
  enum Operation: String, Decodable, Sendable {
    case upsert
    case delete
  }

  let tenantId: String
  let revision: Int
  let operation: Operation
  let photoId: String
  let assetId: String?
  let published: Bool
  let photo: ManifestPhoto?
  let asset: PhotoChangeAsset?
}

enum PhotoChangeDecoding {
  static func decode(_ blob: Any) -> PhotoChange? {
    guard JSONSerialization.isValidJSONObject(blob),
          let data = try? JSONSerialization.data(withJSONObject: blob)
    else { return nil }
    return try? APIResponseDecoding.decode(PhotoChange.self, from: data)
  }

  static func changes(from event: [String: Any]) -> [PhotoChange] {
    var blobs: [Any] = []
    collect(from: event, into: &blobs)
    if let nested = event["payload"] as? [String: Any] {
      collect(from: nested, into: &blobs)
    }
    return blobs.compactMap { decode($0) }
  }

  private static func collect(from object: [String: Any], into blobs: inout [Any]) {
    if let change = object["change"] {
      blobs.append(change)
    }
    if let action = object["action"] as? [String: Any], let change = action["change"] {
      blobs.append(change)
    }
    if let actions = object["actions"] as? [[String: Any]] {
      blobs.append(contentsOf: actions.compactMap { $0["change"] })
    }
  }
}

struct ManifestSnapshotResponse: Decodable, Sendable {
  let revision: Int
  let manifest: ManifestEnvelope
}

struct ManifestChangesResponse: Decodable, Sendable {
  let revision: Int
  let expired: Bool
  let changes: [PhotoChange]
}

struct PhotoReplicaState: Equatable, Sendable {
  var tenantSlug: String
  var tenantId: String?
  var contiguousRevision: Int
  var needsReconcile: Bool
  var lastSyncedAt: Date?
}
