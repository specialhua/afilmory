import Foundation
import Observation

private struct PhotoCommentCountResponse: Decodable {
  let count: Int
}

@Observable
@MainActor
final class PhotoCommentCount {
  private(set) var count: Int?
  private(set) var key: String?
  @ObservationIgnored var onChange: ((Int?) -> Void)?
  private var gallerySlug: String?
  private var photoId: String?
  @ObservationIgnored private var task: Task<Void, Never>?

  func load(gallerySlug: String?, photoId: String?) {
    task?.cancel()
    self.gallerySlug = gallerySlug
    self.photoId = photoId
    guard let gallerySlug, let photoId else {
      key = nil
      count = nil
      onChange?(nil)
      return
    }
    key = Self.key(gallerySlug: gallerySlug, photoId: photoId)
    count = nil
    onChange?(nil)
    refresh()
  }

  func refresh() {
    task?.cancel()
    guard let gallerySlug, let photoId else {
      key = nil
      count = nil
      onChange?(nil)
      return
    }
    let requestKey = Self.key(gallerySlug: gallerySlug, photoId: photoId)
    key = requestKey
    task = Task { [weak self] in
      do {
        let baseURL = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: gallerySlug)
        let endpoint = APIEndpoint(
          baseURL: .explicit(baseURL.absoluteString),
          path: "comments/count",
          queryItems: [URLQueryItem(name: "photoId", value: photoId)]
        )
        let response: PhotoCommentCountResponse = try await AfilmoryAPI.shared.request(endpoint)
        guard !Task.isCancelled, self?.key == requestKey else { return }
        self?.count = max(0, response.count)
        self?.onChange?(self?.count)
      } catch {
        guard !Task.isCancelled, self?.key == requestKey else { return }
        self?.count = nil
        self?.onChange?(nil)
      }
    }
  }

  func setCount(_ count: Int) {
    guard key != nil else { return }
    self.count = max(0, count)
    onChange?(self.count)
  }

  private static func key(gallerySlug: String, photoId: String) -> String {
    "\(gallerySlug):\(photoId)"
  }
}
