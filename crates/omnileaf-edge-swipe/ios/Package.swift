// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "omnileaf-edge-swipe",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "omnileaf-edge-swipe", type: .static, targets: ["omnileaf-edge-swipe"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "omnileaf-edge-swipe",
      dependencies: [
        .product(name: "Tauri", package: "Tauri")
      ],
      path: "Sources/EdgeSwipePlugin")
  ]
)
