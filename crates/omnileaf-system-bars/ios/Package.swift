// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "omnileaf-system-bars",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "omnileaf-system-bars", type: .static, targets: ["omnileaf-system-bars"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "omnileaf-system-bars",
      dependencies: [
        .product(name: "Tauri", package: "Tauri")
      ],
      path: "Sources/SystemBarsPlugin")
  ]
)
