import AppKit
import CoreGraphics
import Foundation

// C ABI for the Bun main process (src/bun/native/macos.ts).
// Functions that return strings return strdup memory or NULL.
// The caller copies the string and releases it with tn_free.

private func dup(_ value: String?) -> UnsafeMutablePointer<CChar>? {
    guard let value else { return nil }
    return strdup(value)
}

@_cdecl("tn_frontmost_bundle_id")
public func tn_frontmost_bundle_id() -> UnsafeMutablePointer<CChar>? {
    dup(NSWorkspace.shared.frontmostApplication?.bundleIdentifier)
}

@_cdecl("tn_idle_seconds")
public func tn_idle_seconds() -> Double {
    // ~0 is kCGAnyInputEventType: keyboard, mouse, trackpad and tablet input.
    guard let anyInput = CGEventType(rawValue: ~0) else { return 0 }
    return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
}

@_cdecl("tn_free")
public func tn_free(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}
