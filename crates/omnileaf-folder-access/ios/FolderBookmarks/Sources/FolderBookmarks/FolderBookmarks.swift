import Foundation

public struct BookmarkedFolder: Equatable, Sendable {
  public let path: String
  public let bookmark: Data

  public init(path: String, bookmark: Data) {
    self.path = path
    self.bookmark = bookmark
  }
}

public struct ResolvedFolder: Equatable, Sendable {
  public let path: String
  public let refreshedBookmark: Data?

  public init(path: String, refreshedBookmark: Data?) {
    self.path = path
    self.refreshedBookmark = refreshedBookmark
  }
}

/// Keeps security-scoped access to every folder it bookmarks or resolves until the process exits.
public final class FolderBookmarks: @unchecked Sendable {
  private let lock = NSLock()
  private var accessed: [String: URL] = [:]

  public init() {}

  /// Bookmarks a folder the person just picked, named by the path its bookmark resolves to so later resolutions compare equal.
  public func bookmark(for picked: URL) throws -> BookmarkedFolder {
    let isAccessing = picked.startAccessingSecurityScopedResource()
    defer {
      if isAccessing {
        picked.stopAccessingSecurityScopedResource()
      }
    }
    let bookmark = try picked.bookmarkData()
    let resolved = try resolve(bookmark)
    return BookmarkedFolder(path: resolved.path, bookmark: resolved.refreshedBookmark ?? bookmark)
  }

  public func resolve(_ bookmark: Data) throws -> ResolvedFolder {
    var isStale = false
    let folder = try URL(
      resolvingBookmarkData: bookmark,
      options: [.withoutUI, .withoutImplicitStartAccessing],
      relativeTo: nil,
      bookmarkDataIsStale: &isStale)
    keepAccess(to: folder)
    let refreshed = isStale ? try? folder.bookmarkData() : nil
    return ResolvedFolder(path: folder.path, refreshedBookmark: refreshed)
  }

  /// Takes access once per folder, since a folder inside the app's own container needs none and reports so by declining.
  private func keepAccess(to folder: URL) {
    lock.withLock {
      guard accessed[folder.path] == nil, folder.startAccessingSecurityScopedResource() else {
        return
      }
      accessed[folder.path] = folder
    }
  }
}
