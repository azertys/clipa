import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ServiceManagement

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

@_cdecl("tn_frontmost_app_name")
public func tn_frontmost_app_name() -> UnsafeMutablePointer<CChar>? {
    dup(NSWorkspace.shared.frontmostApplication?.localizedName)
}

/// The title of the focused window of the frontmost app. NULL without Accessibility
/// permission, without a focused window, or when the app does not answer in time.
@_cdecl("tn_focused_window_title")
public func tn_focused_window_title() -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted(), let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier else {
        return nil
    }
    let app = AXUIElementCreateApplication(pid)
    // A busy app must not block the sampler.
    AXUIElementSetMessagingTimeout(app, 0.25)
    var window: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &window) == .success,
          let window, CFGetTypeID(window) == AXUIElementGetTypeID()
    else { return nil }
    var title: CFTypeRef?
    guard AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &title) == .success
    else { return nil }
    return dup(title as? String)
}

@_cdecl("tn_idle_seconds")
public func tn_idle_seconds() -> Double {
    // ~0 is kCGAnyInputEventType: keyboard, mouse, trackpad and tablet input.
    guard let anyInput = CGEventType(rawValue: ~0) else { return 0 }
    return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
}

/// 1 when the app has Accessibility permission. With prompt = 1, macOS shows its prompt.
@_cdecl("tn_ax_trusted")
public func tn_ax_trusted(_ prompt: Int32) -> Int32 {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt == 1] as CFDictionary
    return AXIsProcessTrustedWithOptions(options) ? 1 : 0
}

/// Launch at login: 1 = on, 0 = off, 2 = waiting for approval in System Settings, -1 = not available.
@_cdecl("tn_launch_at_login_get")
public func tn_launch_at_login_get() -> Int32 {
    switch SMAppService.mainApp.status {
    case .enabled: return 1
    case .requiresApproval: return 2
    case .notRegistered: return 0
    default: return -1
    }
}

/// Turns launch at login on (1) or off (0). Returns the new state as tn_launch_at_login_get does.
@_cdecl("tn_launch_at_login_set")
public func tn_launch_at_login_set(_ enabled: Int32) -> Int32 {
    do {
        if enabled == 1 {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    } catch {
        NSLog("ClipaNative: launch at login: \(error)")
    }
    return tn_launch_at_login_get()
}

@_cdecl("tn_free")
public func tn_free(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}
