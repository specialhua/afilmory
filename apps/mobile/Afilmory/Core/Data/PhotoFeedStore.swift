import Foundation
import GRDB
import Observation

enum PhotoFeedLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case failed
}

@Observable
final class PhotoFeed: @unchecked Sendable {
  let key: PhotoFeedKey
  private(set) var photos: [GalleryPhoto] = []
  private(set) var studioPhotos: [StudioFeedPhoto] = []
  private(set) var loadState: PhotoFeedLoadState = .idle
  private(set) var lastError: String?

  @ObservationIgnored private var observers: [UUID: @MainActor () -> Void] = [:]

  init(key: PhotoFeedKey) {
    self.key = key
  }

  @MainActor
  func update(
    photos: [GalleryPhoto],
    studioPhotos: [StudioFeedPhoto] = [],
    state: PhotoFeedLoadState,
    error: String? = nil
  ) {
    self.photos = photos
    self.studioPhotos = studioPhotos
    loadState = state
    lastError = error
    for observer in observers.values {
      observer()
    }
  }

  @MainActor
  func observe(_ observer: @escaping @MainActor () -> Void) -> PhotoFeedObservationToken {
    let id = UUID()
    observers[id] = observer
    return PhotoFeedObservationToken { [weak self] in
      Task { @MainActor in
        self?.observers.removeValue(forKey: id)
      }
    }
  }
}

final class PhotoFeedObservationToken {
  private var cancellation: (() -> Void)?

  init(cancellation: @escaping () -> Void) {
    self.cancellation = cancellation
  }

  func cancel() {
    cancellation?()
    cancellation = nil
  }

  deinit {
    cancel()
  }
}

@MainActor
final class PhotoFeedStore {
  static let shared = PhotoFeedStore()

  private let repository: PhotoReplicaRepository
  private let engine: PhotoSyncEngine
  private var feeds: [PhotoFeedKey: PhotoFeed] = [:]
  private var observations: [PhotoFeedKey: any DatabaseCancellable] = [:]

  init(
    repository: PhotoReplicaRepository = PhotoReplicaRepository(),
    engine: PhotoSyncEngine = .shared
  ) {
    self.repository = repository
    self.engine = engine
  }

  func feed(for key: PhotoFeedKey) -> PhotoFeed {
    if let feed = feeds[key] {
      return feed
    }
    let feed = PhotoFeed(key: key)
    feeds[key] = feed
    return feed
  }

  func load(_ key: PhotoFeedKey, force: Bool = false) {
    let feed = feed(for: key)
    guard let slug = slug(for: key) else {
      feed.update(photos: [], studioPhotos: [], state: .failed, error: "Missing workspace")
      return
    }

    bindObservation(key, slug: slug)
    if let snapshot = try? currentSnapshot(key, slug: slug), !snapshot.photos.isEmpty || !snapshot.studio.isEmpty {
      feed.update(photos: snapshot.photos, studioPhotos: snapshot.studio, state: .loaded)
    } else if feed.loadState == .idle {
      feed.update(photos: feed.photos, studioPhotos: feed.studioPhotos, state: .loading)
    }

    engine.ensureSynced(slug: slug, force: force, includeStudio: key == .studioLibrary)
  }

  func applyCommitted(_ change: PhotoChange) {
    guard let slug = slug(for: change) else { return }
    engine.applyCommitted(change, slug: slug)
    if feeds[.manifest(slug)] == nil, feeds[.studioLibrary] == nil {
      return
    }
    if let home = feeds[.manifest(slug)], let photos = try? repository.publishedPhotos(for: slug) {
      home.update(photos: photos, state: .loaded)
    }
    if let studio = feeds[.studioLibrary], let studioPhotos = try? repository.studioPhotos(for: slug) {
      studio.update(photos: studioPhotos.map(\.photo), studioPhotos: studioPhotos, state: .loaded)
    }
  }

  private func bindObservation(_ key: PhotoFeedKey, slug: String) {
    if observations[key] != nil {
      return
    }
    let feed = feed(for: key)
    switch key {
    case .manifest:
      observations[key] = repository.observePublished(slug: slug) { photos in
        Task { @MainActor in
          feed.update(photos: photos, state: .loaded)
        }
      }
    case .studioLibrary:
      observations[key] = repository.observeStudio(slug: slug) { studioPhotos in
        Task { @MainActor in
          feed.update(
            photos: studioPhotos.map(\.photo),
            studioPhotos: studioPhotos,
            state: .loaded
          )
        }
      }
    }
  }

  private func currentSnapshot(_ key: PhotoFeedKey, slug: String) throws -> (photos: [GalleryPhoto], studio: [StudioFeedPhoto]) {
    switch key {
    case .manifest:
      return (try repository.publishedPhotos(for: slug), [])
    case .studioLibrary:
      let studio = try repository.studioPhotos(for: slug)
      return (studio.map(\.photo), studio)
    }
  }

  private func slug(for key: PhotoFeedKey) -> String? {
    switch key {
    case .manifest(let slug):
      slug
    case .studioLibrary:
      currentWorkspaceSlug()
    }
  }

  private func slug(for change: PhotoChange) -> String? {
    currentWorkspaceSlug() ?? feeds.keys.compactMap { key in
      if case .manifest(let slug) = key { return slug }
      return nil
    }.first
  }

  private func currentWorkspaceSlug() -> String? {
    if case .signedIn(let session) = AfilmorySessionStore.shared.current().state {
      return session.activeWorkspace?.slug
    }
    return nil
  }
}
