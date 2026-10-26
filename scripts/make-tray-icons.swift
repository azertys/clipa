// Draws the monochrome tray template images (36 × 36 px, shown at 18 × 18 pt).
// Run: swift scripts/make-tray-icons.swift assets/tray
import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/tray"
let size = 36

func png(_ name: String, draw: (CGContext) -> Void) throws {
    let space = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { fatalError("no context") }
    ctx.setFillColor(NSColor.black.cgColor)
    ctx.setStrokeColor(NSColor.black.cgColor)
    ctx.setLineCap(.round)
    draw(ctx)
    let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    let data = rep.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
}

let c = CGPoint(x: 18, y: 18)

func hands(_ ctx: CGContext) {
    ctx.setLineWidth(3)
    ctx.move(to: c); ctx.addLine(to: CGPoint(x: 18, y: 27)) // 12 o'clock
    ctx.move(to: c); ctx.addLine(to: CGPoint(x: 24.5, y: 18)) // 3 o'clock
    ctx.strokePath()
}

try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// Idle: clock outline.
try png("idle") { ctx in
    ctx.setLineWidth(3)
    ctx.strokeEllipse(in: CGRect(x: 4.5, y: 4.5, width: 27, height: 27))
    hands(ctx)
}

// Running: filled clock with the hands cut out.
try png("running") { ctx in
    ctx.fillEllipse(in: CGRect(x: 3, y: 3, width: 30, height: 30))
    ctx.setBlendMode(.clear)
    hands(ctx)
}
