# Clipa logo and icons

Accent `#FF5B2E`, ink `#16181D`.

## Logo: `logo/`

The mark, the wordmark, and the lockup in ink and in white. The sidebar shows the white lockup, and
the app icons are drawn from the mark.

## Tray icons: `tray/`

The tray icon has two states. Idle is the clock in one color. Running turns the clock hands accent.
`src/bun/tray.ts` picks the files by name, and `electrobun.config.ts` copies the folder of the OS
that builds.

`macos/ClipaTrayIdleTemplate@2x.png` is a template image: black with alpha, 32 px, shown at 16 pt.
macOS tints it for a light or dark menu bar. Clipa uses it for both states, because Electrobun's
`setImage` drops the template flag. The elapsed time next to the icon shows that the timer runs.

Each `windows/*.ico` holds 16, 20, 24, 32, 40 and 48 px, for 100% to 300% display scaling. The
`-light` files are for a light taskbar and the `-dark` files for a dark one. Clipa reads the taskbar
theme from `SystemUsesLightTheme` under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, because it can differ from the
app theme.

`linux/` has the 48 px PNGs for a dark panel. AppIndicator scales them to the panel.

`svg/` has both states drawn on a 16 px grid, the sources of the files above.

## App icon

`Clipa.icon` is the macOS app icon, an Icon Composer document. The clock (`Assets/clock.svg`, made
by `hutch run icon:mac` as one filled outline, because the compiled icon keeps neither strokes nor
arcs) is a layer on a solid fill, with a color for each appearance in `icon.json`: an ink clock on
white, a white clock on ink in dark mode, and a white clock in the clear and tinted styles. Open it
in Icon Composer (it comes with Xcode 26) to change it. Hutch compiles it with Xcode's `actool`.

`icon.iconset` is the flat icon for Windows and Linux, made by `hutch run icon`
(`scripts/make-app-icon.swift`).
