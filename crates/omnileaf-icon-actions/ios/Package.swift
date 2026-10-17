// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "omnileaf-icon-actions",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "omnileaf-icon-actions", type: .static, targets: ["omnileaf-icon-actions"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "omnileaf-icon-actions",
      dependencies: [
        .product(name: "Tauri", package: "Tauri")
      ],
      path: "Sources/IconActionsPlugin")
  ]
)
