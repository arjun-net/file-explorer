# Files

A fast, fully native macOS file explorer built with SwiftUI. No bundled browser engine — it uses the OS's own `Table`, `NavigationSplitView`, and Quick Look, so it starts in well under 200ms instead of the 1-3+ seconds typical of an Electron app.

An earlier Electron + React version of this app lives on the [`electron`](../../tree/electron) branch for reference; this branch is the native rewrite.

## Features

- Real filesystem browsing — sidebar favorites (Home, Desktop, Documents, Downloads, Pictures, Music, Movies, Applications) plus mounted volumes
- List view with real sortable columns (native `Table`) and a grid view
- Create, rename, delete (moves to Trash), cut/copy/paste, and drag-and-drop — including dragging files out to Finder, not just in
- Live folder watching — the view updates automatically when files change outside the app
- Instant in-folder filtering plus recursive deep search
- Quick Look preview panel (real thumbnails/previews for any file type Finder supports) with file metadata
- Keyboard shortcuts (⌘C/X/V, ⌘A, Delete, ⌘⇧N new folder, ⌘F search, ⌘[/⌘] back/forward, ⌘↑ up)
- Follows the system's light/dark appearance automatically

## Install

Download the latest `.dmg` from the [Releases](../../releases) page, open it, and drag **Files.app** into **Applications**.

The app is ad-hoc signed but not notarized (that requires a paid Apple Developer account), so macOS will show a "cannot verify developer" warning on first launch. Either:

- Right-click (or Control-click) **Files.app** → **Open** → **Open**, or
- Run `xattr -cr /Applications/Files.app` in Terminal once.

## Development

Requires Xcode (or at least the Swift toolchain) for macOS 14+.

```bash
swift build            # debug build
swift run               # build and launch
```

## Building an installer

```bash
./scripts/build-app.sh   # builds, ad-hoc signs, and produces release/Files.app + release/Files.dmg
```

## Stack

Swift 6 · SwiftUI · AppKit (`NSViewRepresentable` for Quick Look) · Swift Package Manager
