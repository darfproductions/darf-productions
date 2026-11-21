// swift-tools-version: 5.9
import PackageDescription

// Complemento propio de la app DARF: "Iniciar sesión con Apple" con la ventana nativa de iOS.
let package = Package(
    name: "DarfApple",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "DarfApple",
            targets: ["DarfApplePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "DarfApplePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/DarfApplePlugin")
    ]
)
