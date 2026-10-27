# Clipa

A local-first desktop time tracker for one user. macOS first; Windows and Linux builds run without
app tracking (docs/decisions.md, D52). Built with Electrobun 2 (Bun main process, system webview),
Svelte 5 and SQLite.

## Requirements

- macOS 14 or later on Apple Silicon
- Hutch (Electrobun's CLI). `npx electrobun init` installs it to `~/.hutch`, or see
  <https://hutch.blackboard.sh>.
- Xcode 26 for the macOS build: Swift for `native/macos`, and `actool` for the app icon
  (`assets/Clipa.icon`)
- Windows and Linux builds come from CI, one runner per OS (`docs/release.md`, section 5)

## Commands

```bash
hutch run install   # install dependencies from hutch.lock
hutch run dev       # build and run, rebuild on change
hutch run dev:hmr   # same, with Vite hot reload for the view
hutch run test      # unit and integration tests (bun test)
hutch run check     # svelte-check + TypeScript
hutch run native    # build libclipanative.dylib only
hutch run icon      # redraw assets/icon.iconset (Windows and Linux app icon) from the logo mark
hutch run icon:mac  # redraw the clock layer of assets/Clipa.icon (macOS app icon)
```

The dev build keeps its database at
`~/Library/Application Support/dev.clipa.app/dev/clipa.db`.

## Layout

```
core/            pure TypeScript domain logic and its tests (no Electrobun, Svelte or SQLite)
src/bun/         main process: database, timer, tray, native calls, RPC handlers
src/mainview/    Svelte 5 view; all UI strings are in strings.ts
src/mainview/ui/ design tokens and components (from clipa-ui-svelte)
src/shared/      the typed RPC contract
native/macos/    Swift package that builds libclipanative.dylib
assets/          logo, tray icons and the app icons (see assets/README.md)
docs/            decisions.md, open-questions.md, release.md
```

## Status

- M0 spike: done
- M1 timer, entries, tags, tray: done (two manual UI checks pending, see `docs/decisions.md`)
- M2 calendar and recurrence: done
- M3 reports: done (one check on the Reports screen pending, see `docs/decisions.md`)
- M4 app tracking and idle: done (see `docs/decisions.md` for what still needs a signed build)
- M5 export/import/release: done except the signed DMG and the update host (see `docs/decisions.md`
  and `docs/release.md`)
