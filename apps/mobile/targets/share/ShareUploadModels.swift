import Foundation

struct ShareUploadContextSnapshot: Codable {
  let tenantBaseURL: String
  let workspaceID: String
  let workspaceName: String
  let suggestedTags: [String]
  let updatedAt: Date
}

struct ShareUploadBatchManifest: Codable {
  let id: String
  let workspaceID: String
  let createdAt: Date
  var items: [ShareUploadBatchItem]
}

enum ShareUploadResourceRole: String, Codable {
  case photo
  case pairedVideo
}

struct ShareUploadBatchResource: Codable, Equatable {
  let role: ShareUploadResourceRole
  let relativePath: String
  let name: String
  let mimeType: String
  let bytes: Int64
}

struct ShareUploadBatchItem: Codable, Identifiable, Equatable {
  let id: String
  let previewRelativePath: String?
  let resources: [ShareUploadBatchResource]

  var name: String {
    resources.first(where: { $0.role == .photo })?.name ?? "Photo"
  }

  var bytes: Int64 {
    resources.reduce(0) { $0 + $1.bytes }
  }

  var isLivePhoto: Bool {
    resources.contains { $0.role == .pairedVideo }
  }
}

struct ShareUploadReceipt: Decodable {
  let status: String
  let count: Int
  let message: String?
  let updatedAt: Date
}

enum ShareUploadPhase: Equatable {
  case idle
  case loading
  case ready
  case unavailable
  case failed
}

enum ShareUploadError: LocalizedError {
  case incompleteLivePhoto
  case livePhotoNotFound
  case missingContainer
  case noImages
  case photoLibraryAccessDenied
  case unreadableImage
  case unsupportedLivePhotoResources

  var errorDescription: String? {
    switch self {
    case .incompleteLivePhoto:
      "A Live Photo is missing its paired video and cannot be uploaded."
    case .livePhotoNotFound:
      "Afilmory could not match the shared Live Photo to its photo library asset."
    case .missingContainer:
      "Afilmory could not access its shared upload container."
    case .noImages:
      "No supported images were provided."
    case .photoLibraryAccessDenied:
      "Full photo library access is required to upload both parts of a Live Photo."
    case .unreadableImage:
      "One of the shared images could not be read."
    case .unsupportedLivePhotoResources:
      "The Live Photo does not contain a HEIC still and MOV paired video."
    }
  }
}
