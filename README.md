# Clipa

A local-first time tracker for the desktop. Start a timer from the window or the tray, plan events
on a calendar, and see where your time went in reports. While a timer runs, Clipa can record which
app is in front, and when you come back from a break it asks what to do with the idle time.

![The Today screen: a running timer, the day's events and tracked time on a timeline, and the entries](.github/screenshot.png)

All data stays in a SQLite database on your computer. The only network call is "Check for updates".

Clipa runs on macOS, Windows and Linux. It's built with [Electrobun](https://framework.blackboard.sh/electrobun/)
2 (a Bun main process with the system webview), Svelte 5 and SQLite.

## Download

The [Releases](https://github.com/azertys/clipa/releases) page has a build for each system:

| File | For |
| --- | --- |
| `macos-arm64-Clipa.dmg` | macOS 14 or later on Apple silicon |
| `win-x64-Clipa-Setup.zip` | Windows 10 or 11 (x64): unzip it and run the setup program |
| `linux-x64-Clipa-Setup.tar.gz` | Linux (x64): extract it and run `installer` |

The `stable-*` files are for the updater. On an Intel Mac or an ARM PC, build Clipa from source.

The builds are unsigned. The first time you open Clipa, macOS says that it can't verify it. Click
"Done", then open System Settings > Privacy & Security and click "Open Anyway" next to the message
about Clipa.

Launch at login needs a signed build on macOS, so it doesn't work in these builds.

On Windows, SmartScreen warns on the first start: click "More info", then "Run anyway".

## Requirements

To run Clipa:

- macOS 14 or later
- Windows 10 or 11, with the WebView2 runtime (both include it)
- Linux with GTK 3, WebKitGTK 4.1, Ayatana AppIndicator, librsvg and libXss. On Ubuntu and Debian:

  ```bash
  sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2 libxss1
  ```

To build it:

- [Hutch](https://framework.blackboard.sh/electrobun/guides/hutch/), Electrobun's command line tool. It downloads the Electrobun
  and Bun versions that `hutch.config.ts` pins.
- Node.js 20.19 or later, for Vite.
- On macOS, Xcode 26. Swift builds the native library in `native/macos`, and `actool` compiles the
  app icon (`assets/Clipa.icon`).

Hutch builds only for the OS and CPU it runs on, so you build each OS's release on that OS.

## Build

Install Hutch on macOS or Linux:

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
```

On Windows, in PowerShell:

```powershell
Invoke-WebRequest -UseBasicParsing https://hutch.blackboard.sh/hutch/install.ps1 -OutFile install-hutch.ps1
./install-hutch.ps1
```

Then, in the repository:

```bash
hutch run install   # install the dependencies from hutch.lock
hutch run build     # make a release build in artifacts/
```

`artifacts/` then has the installer for your OS (`macos-arm64-Clipa.dmg`, `win-x64-Clipa-Setup.zip`
or `linux-x64-Clipa-Setup.tar.gz`, where the Linux archive has an `installer` to run), and the
`stable-*` files that the updater downloads.

### Development

```bash
hutch run dev       # build and run, rebuild on change
hutch run dev:hmr   # the same, with Vite hot reload for the view
hutch run test      # unit and integration tests (bun test)
hutch run check     # svelte-check and TypeScript
hutch run native    # build only the macOS library (libclipanative.dylib)
hutch run icon      # redraw assets/icon.iconset (the Windows and Linux app icon) from the logo mark
hutch run icon:mac  # redraw the clock layer of assets/Clipa.icon (the macOS app icon)
```

Clipa keeps its database in `dev.clipa.app/<channel>/clipa.db` in the user's data folder:
`~/Library/Application Support` on macOS, `%LOCALAPPDATA%` on Windows and `~/.local/share` on Linux.
The channel is `stable` for release builds and `dev` for `hutch run dev`, so development never
touches your real data.

### Signing

On macOS, signing and notarization turn on when these variables are set. Without them,
`hutch run build` makes an unsigned build, and `scripts/sign-adhoc.ts` signs it ad hoc so that
macOS offers "Open Anyway" after a download.

| Variable | For |
| --- | --- |
| `ELECTROBUN_DEVELOPER_ID` | Signing: the name of a "Developer ID Application" certificate in the login keychain, for example `Developer ID Application: Name (TEAMID)` |
| `ELECTROBUN_APPLEAPIKEY`, `ELECTROBUN_APPLEAPIISSUER`, `ELECTROBUN_APPLEAPIKEYPATH` | Notarization with an App Store Connect API key |
| `ELECTROBUN_APPLEID`, `ELECTROBUN_APPLEIDPASS`, `ELECTROBUN_TEAMID` | Notarization with an Apple ID and an app-specific password |
| `ELECTROBUN_SKIP_NOTARIZATION=1` | Sign, but skip notarization for one build |

Hutch signs the nested library too, so it gets the app's identity. An unsigned Mac build can't
launch at login, and macOS asks again for the Accessibility permission after each rebuild.

Windows has no signing setup yet.

### Updates

Clipa checks for updates only when you click "Check for updates". To turn this on, set
`release.baseUrl` in `electrobun.config.ts` to an HTTPS folder, build, and upload every file of
`artifacts/` to that folder without renaming it. Keep the old `.patch` files there: a missing patch
must give a 404, and the updater then downloads the full archive. Without `baseUrl`, Settings says
that the build doesn't check for updates.

## Future development

Clipa works on one computer today. Planned next:

- Calendar sync with Google Calendar and iCal calendars, so the events you plan in Clipa and the
  ones in your other calendars show in both places.
- Database sync through a storage service such as Google Drive, so your computers share the same
  entries, tags and events.

## Project layout

```
core/            domain logic and its tests, with no Electrobun, Svelte or SQLite
src/bun/         main process: database, timer, tray, RPC handlers
src/bun/native/  platform calls: the macOS library, and Windows and Linux system libraries (Bun FFI)
src/mainview/    Svelte 5 view; all UI text is in strings.ts
src/shared/      the typed RPC contract and the platform check
native/macos/    Swift package that builds libclipanative.dylib
assets/          logo, tray icons and app icons (see assets/README.md)
scripts/         build hook and icon generators
```

## License

Copyright 2026 Spiridon Alin

Clipa is licensed under the [Apache License, Version 2.0](LICENSE). You can use, change and share
it, also in closed-source and commercial apps, if you keep the license and the copyright notice and
mark the files you change. It comes without warranty of any kind.

The Clipa name and logo are not covered by this license. A modified version that you share must
use a different name and logo.
