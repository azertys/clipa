// Writes the clock layer of assets/Clipa.icon: the Clipa mark (assets/logo/clipa-mark.svg) on the
// 1024 px icon canvas as one filled outline. The compiled app icon keeps neither strokes nor arcs,
// so the stroke of "M80.58 26.86 A36 36 0 1 0 80.58 73.14 L53 50 V28" (width 10, round caps and
// joins) is outlined here, with only M, L, C and Z commands.
// Run: swift scripts/make-icon-mark.swift assets/Clipa.icon/Assets/clock.svg
import CoreGraphics
import Foundation

let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/Clipa.icon/Assets/clock.svg"
// 7.6 times the mark's 100-unit view box, centered on the canvas.
let scale = 7.6, offset = 132.0

let path = CGMutablePath()
// From the top right around the left to the bottom right (the long way, through 180°).
path.addArc(center: CGPoint(x: 53, y: 50), radius: 36, startAngle: -40 * .pi / 180, endAngle: 40 * .pi / 180, clockwise: true)
path.addLine(to: CGPoint(x: 53, y: 50))
path.addLine(to: CGPoint(x: 53, y: 28))
let outline = path.copy(strokingWithWidth: 10, lineCap: .round, lineJoin: .round, miterLimit: 10)

func f(_ p: CGPoint) -> String {
    String(format: "%.2f %.2f", p.x * scale + offset, p.y * scale + offset)
}
var d = ""
var current = CGPoint.zero
outline.applyWithBlock { element in
    let pts = element.pointee.points
    switch element.pointee.type {
    case .moveToPoint:
        d += "M\(f(pts[0]))"
        current = pts[0]
    case .addLineToPoint:
        d += "L\(f(pts[0]))"
        current = pts[0]
    case .addQuadCurveToPoint:
        // As a cubic: the control points are two thirds of the way to the quadratic one.
        let c1 = CGPoint(x: current.x + 2 / 3 * (pts[0].x - current.x), y: current.y + 2 / 3 * (pts[0].y - current.y))
        let c2 = CGPoint(x: pts[1].x + 2 / 3 * (pts[0].x - pts[1].x), y: pts[1].y + 2 / 3 * (pts[0].y - pts[1].y))
        d += "C\(f(c1)) \(f(c2)) \(f(pts[1]))"
        current = pts[1]
    case .addCurveToPoint:
        d += "C\(f(pts[0])) \(f(pts[1])) \(f(pts[2]))"
        current = pts[2]
    case .closeSubpath:
        d += "Z"
    @unknown default:
        break
    }
}

let svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- Made by scripts/make-icon-mark.swift from the Clipa mark. icon.json sets the colors. -->
  <path fill="#16181D" d="\(d)"/>
</svg>

"""
try svg.write(toFile: outPath, atomically: true, encoding: .utf8)
print("wrote \(outPath)")
