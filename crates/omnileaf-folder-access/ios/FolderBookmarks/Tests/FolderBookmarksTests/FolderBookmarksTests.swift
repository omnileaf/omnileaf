import FolderBookmarks
import XCTest

final class FolderBookmarksTests: XCTestCase {
  private var scratch = FileManager.default.temporaryDirectory

  override func setUpWithError() throws {
    scratch = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: scratch)
  }

  private func makeFolder(_ name: String) throws -> URL {
    let folder = scratch.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    return folder
  }

  func testAFolderThatStayedPutResolvesWhereItWasPickedWithNoNewBookmark() throws {
    let bookmarks = FolderBookmarks()
    let picked = try bookmarks.bookmark(for: try makeFolder("Comics"))

    let resolved = try bookmarks.resolve(picked.bookmark)

    XCTAssertEqual(resolved, ResolvedFolder(path: picked.path, refreshedBookmark: nil))
  }

  func testARenamedFolderResolvesToItsNewPathWithAFreshBookmark() throws {
    let bookmarks = FolderBookmarks()
    let folder = try makeFolder("Comics")
    let picked = try bookmarks.bookmark(for: folder)
    try FileManager.default.moveItem(at: folder, to: scratch.appendingPathComponent("Manga"))

    let resolved = try bookmarks.resolve(picked.bookmark)

    let renamedPath = (picked.path as NSString).deletingLastPathComponent + "/Manga"
    XCTAssertEqual(resolved.path, renamedPath)
    let refreshed = try XCTUnwrap(resolved.refreshedBookmark)
    XCTAssertEqual(
      try bookmarks.resolve(refreshed), ResolvedFolder(path: renamedPath, refreshedBookmark: nil))
  }

  func testADeletedFolderDoesNotResolve() throws {
    let bookmarks = FolderBookmarks()
    let folder = try makeFolder("Comics")
    let picked = try bookmarks.bookmark(for: folder)
    try FileManager.default.removeItem(at: folder)

    XCTAssertThrowsError(try bookmarks.resolve(picked.bookmark))
  }

  func testDamagedBookmarkDataDoesNotResolve() {
    let bookmarks = FolderBookmarks()

    XCTAssertThrowsError(try bookmarks.resolve(Data([0, 1, 2, 3])))
  }
}
