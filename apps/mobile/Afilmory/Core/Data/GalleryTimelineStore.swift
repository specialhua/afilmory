import Foundation

@MainActor
final class GalleryTimelineStore {
  static let shared = GalleryTimelineStore()

  private(set) var events: [GalleryTimelineEvent] = []
  private(set) var isLoading = false
  private(set) var loadFailed = false
  private(set) var nextCursor: String?

  func refresh(timeZone: String) async {
    isLoading = true
    loadFailed = false
    do {
      let response: GalleryTimelineResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.timeline(timeZone: timeZone, cursor: nil)
      )
      events = response.events
      nextCursor = response.nextCursor
      loadFailed = false
    } catch {
      loadFailed = events.isEmpty
    }
    isLoading = false
  }

  func loadMore(timeZone: String) async {
    guard let cursor = nextCursor, !isLoading else { return }
    isLoading = true
    do {
      let response: GalleryTimelineResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.timeline(timeZone: timeZone, cursor: cursor)
      )
      let existing = Set(events.map(\.id))
      events.append(contentsOf: response.events.filter { !existing.contains($0.id) })
      nextCursor = response.nextCursor
      loadFailed = false
    } catch {
      loadFailed = true
    }
    isLoading = false
  }

  func removeEvents(tenantId: String) {
    events = removingTimelineEvents(events, tenantId: tenantId)
  }
}
