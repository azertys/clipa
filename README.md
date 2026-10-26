# Clipa

A local-first desktop time tracker for one user. macOS first. Built with Electrobun 2 (Bun main
process, system WKWebView), Svelte 5 and SQLite.

## Requirements

- macOS 14 or later on Apple Silicon
- Hutch (Electrobun's CLI). `npx electrobun init` installs it to `~/.hutch`, or see
  <https://hutch.blackboard.sh>.
- Swift (the Xcode Command Line Tools are enough) for `native/macos`

## Commands

```bash
hutch run install   # install dependencies from hutch.lock
hutch run dev       # build and run, rebuild on change
hutch run dev:hmr   # same, with Vite hot reload for the view
hutch run test      # unit and integration tests (bun test)
hutch run check     # svelte-check + TypeScript
hutch run native    # build libclipanative.dylib only
```

The dev build keeps its database at
`~/Library/Application Support/dev.clipa.app/dev/clipa.db`.

## Layout

```
core/            pure TypeScript domain logic and its tests (no Electrobun, Svelte or SQLite)
src/bun/         main process: database, timer, tray, native calls, RPC handlers
src/mainview/    Svelte 5 view; all UI strings are in strings.ts
src/shared/      the typed RPC contract
native/macos/    Swift package that builds libclipanative.dylib
docs/            decisions.md, open-questions.md
```

## Status

- M0 spike: done
- M1 timer, entries, tags, tray: done (two manual UI checks pending, see `docs/decisions.md`)
- M2 calendar, M3 reports, M4 tracking and idle, M5 export/import/release: not started
