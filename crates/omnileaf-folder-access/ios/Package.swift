// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "omnileaf-folder-access",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [
    .library(name: "omnileaf-folder-access", type: .static, targets: ["omnileaf-folder-access"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api"),
    .package(path: "FolderBookmarks"),
  ],
  targets: [
    .target(
      name: "omnileaf-folder-access",
      dependencies: [
        .product(name: "Tauri", package: "Tauri"),
        .product(name: "FolderBookmarks", package: "FolderBookmarks"),
      ],
      path: "Sources/FolderAccessPlugin")
  ]
)
