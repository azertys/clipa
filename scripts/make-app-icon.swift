// Draws the macOS app icon set from the logo mark: the ink mark on a white rounded square,
// on Apple's 1024 px grid (824 px body, 100 px margin).
// Run: swift scripts/make-app-icon.swift assets/logo/clipa-mark.svg assets/icon.iconset
import AppKit

let args = CommandLine.arguments
let markPath = args.count > 1 ? args[1] : "assets/logo/clipa-mark.svg"
let outDir = args.count > 2 ? args[2] : "assets/icon.iconset"

guard let mark = NSImage(contentsOfFile: markPath) else { fatalError("cannot read \(markPath)") }
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func render(pixels: Int) -> Data {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
    )!
    rep.size = NSSize(width: 1024, height: 1024)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high

    let body = NSRect(x: 100, y: 100, width: 824, height: 824)
    let shape = NSBezierPath(roundedRect: body, xRadius: 185, yRadius: 185)
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
    shadow.shadowOffset = NSSize(width: 0, height: -10)
    shadow.shadowBlurRadius = 24
    NSGraphicsContext.saveGraphicsState()
    shadow.set()
    NSColor.white.setFill()
    shape.fill()
    NSGraphicsContext.restoreGraphicsState()

    // The mark's 100-unit view box, drawn 640 px wide in the middle of the body.
    mark.draw(in: NSRect(x: 192, y: 192, width: 640, height: 640))

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

// iconutil names: icon_<points>x<points>[@2x].png
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
        try render(pixels: points * scale).write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
    }
}
print("wrote \(outDir)")
