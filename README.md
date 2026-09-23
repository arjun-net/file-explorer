# Files

A fast, native desktop file explorer built with Electron, React, and TypeScript — growing into an agentic search tool for large drives. See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how the indexing/search layer is built and what's next.

## Features

- Real filesystem browsing — sidebar favorites (Home, Desktop, Documents, Downloads, Pictures, Music, Movies, Applications) plus mounted volumes
- List and grid views, sortable by name, size, date modified, or kind
- Create, rename, delete (moves to Trash), cut/copy/paste, and drag-and-drop (including dragging files in from Finder)
- Live folder watching — the view updates automatically when files change outside the app
- Instant in-folder filtering plus recursive deep search
- Preview panel with image/text preview and file metadata
- Full keyboard shortcuts (⌘C/X/V, ⌘A, Delete, F2 rename, ⌘⇧N new folder, ⌘F search, ⌘[/⌘] back/forward, arrow-key navigation)
- Light/dark theme with system detection, and persisted view preferences
- **Indexed search** (toolbar database icon): index a folder into a local SQLite FTS5 database — including EXIF metadata for photos — for instant substring search, kept current automatically as files change. Foundation for the agentic search described in [ARCHITECTURE.md](ARCHITECTURE.md); an LLM search agent and content-based media search (CLIP embeddings) are the next phases, not yet built.

## Install

Download the latest `.dmg` from the [Releases](../../releases) page, open it, and drag **Files.app** into **Applications**.

The app is not code-signed or notarized, so on first launch macOS Gatekeeper will block it. Either:

- Right-click (or Control-click) **Files.app** → **Open** → **Open**, or
- Run `xattr -cr /Applications/Files.app` in Terminal once.

## Development

```bash
npm install
npm run dev       # launches Vite + Electron with hot reload
```

## Building an installer

```bash
npm run dist       # produces a .dmg and .zip in release/
```

## Stack

Electron 44 · React 19 · TypeScript · Vite · esbuild (main/preload bundling) · electron-builder (packaging)
