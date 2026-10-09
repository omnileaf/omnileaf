// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "FolderBookmarks",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "FolderBookmarks", targets: ["FolderBookmarks"])],
  targets: [
    .target(name: "FolderBookmarks"),
    .testTarget(name: "FolderBookmarksTests", dependencies: ["FolderBookmarks"]),
  ]
)
