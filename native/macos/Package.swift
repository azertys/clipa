// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ClipaNative",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "clipanative", type: .dynamic, targets: ["ClipaNative"]),
    ],
    targets: [
        .target(
            name: "ClipaNative",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("CoreGraphics"),
            ]
        ),
    ]
)
