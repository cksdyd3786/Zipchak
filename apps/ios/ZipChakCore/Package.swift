// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ZipChakCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "ZipChakCore",
            targets: ["ZipChakCore"]
        )
    ],
    targets: [
        .target(
            name: "ZipChakCore"
        ),
        .testTarget(
            name: "ZipChakCoreTests",
            dependencies: ["ZipChakCore"]
        )
    ]
)
