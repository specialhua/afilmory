import ActivityKit

// ActivityKit matches activities across processes by the attribute type's name
// and Codable shape, so this struct is duplicated verbatim in
// Afilmory/Features/Upload/UploadActivityAttributes.swift — keep both in sync.
struct UploadActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var done: Int
    var failed: Int
    var total: Int
    var progress: Double
  }

  var title: String
}
