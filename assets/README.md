# Clipa logo and tray assets

Accent `#FF5B2E`, ink `#16181D`.

The tray icon has three states. Idle is the wire mark in one color. Running turns the clock hands accent. Paused swaps the hands for two accent pause bars.

## macOS: `tray/macos/`

The menu bar icon is 16 pt. Each file comes as `Name.png` (16 px) and `Name@2x.png` (32 px). Electron and `NSImage(named:)` pick up the `@2x` file on their own.

Files that end in `Template` are black with alpha. macOS tints them for light and dark menu bars. Electron treats a file as a template when its name ends in `Template`. In AppKit, set `isTemplate = true`.

The `Light` and `Dark` files keep the accent color, so macOS can't tint them. Choose one from the menu bar's appearance, and set the image again when the appearance changes:

```swift
func trayImage(_ state: String, for button: NSStatusBarButton) -> NSImage? {
    if state == "Idle" {
        let image = NSImage(named: "ClipaTrayIdleTemplate")
        image?.isTemplate = true
        return image
    }
    let dark = button.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    return NSImage(named: "ClipaTray\(state)\(dark ? "Dark" : "Light")")
}
```

In Electron, use `nativeTheme.shouldUseDarkColors` and listen for its `updated` event.

`ClipaTrayRunningTemplate` has the same shape as the idle template. Use it only for a template-only setup that shows the elapsed time next to the icon, because the shape alone can't show that a timer runs.

## Windows: `tray/windows/`

Each `.ico` holds 16, 20, 24, 32, 40 and 48 px, for 100% to 300% display scaling. Use the `-light` files on a light taskbar and the `-dark` files on a dark one.

The taskbar theme is `SystemUsesLightTheme` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`. It can differ from the app theme (`AppsUseLightTheme`), and the app theme is what Electron's `nativeTheme` reports. Read the registry value if you want the icon to match the taskbar.

The single-size PNGs are in `tray/windows/png/`.

## Sources

`tray/svg/` has the three states drawn on a 16 px grid, with a black ring. `logo/` has the mark, the wordmark, and the lockup in ink and in white.
