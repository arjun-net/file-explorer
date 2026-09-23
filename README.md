# Files

A fast, native desktop file explorer built with Electron, React, and TypeScript — with an agentic search layer for large drives: describe what you're looking for in plain language, and an LLM agent searches by name, metadata, and photo/video *content* to find it. See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how it's built.

## Features

- Real filesystem browsing — sidebar favorites (Home, Desktop, Documents, Downloads, Pictures, Music, Movies, Applications) plus mounted volumes
- List and grid views, sortable by name, size, date modified, or kind
- Create, rename, delete (moves to Trash), cut/copy/paste, and drag-and-drop (including dragging files in from Finder)
- Live folder watching — the view updates automatically when files change outside the app
- Instant in-folder filtering plus recursive deep search
- Preview panel with image/text preview and file metadata
- Full keyboard shortcuts (⌘C/X/V, ⌘A, Delete, F2 rename, ⌘⇧N new folder, ⌘F search, ⌘[/⌘] back/forward, arrow-key navigation)
- Light/dark theme with system detection, and persisted view preferences
- **Indexed search** (toolbar database icon): index a folder into a local SQLite FTS5 database — including EXIF metadata for photos — for instant substring search, kept current automatically: indexed folders are re-watched on every launch (catching up on changes made while the app was closed), and new photos and videos are embedded for content search as they arrive.
- **Content search**: photos and videos get embedded locally with CLIP, so you can search by what's actually *in* them ("dog on a beach") instead of the filename. Runs fully on-device, no API calls.
- **Ask** (the agent): describe what you want in plain language and an LLM decides for itself how to search — by name, by content, by size/date, checking folder summaries before diving into subfolders on large drives. Needs an Anthropic API key, added once via the Settings (gear icon) panel — stored encrypted, locally, via the OS keychain, never sent anywhere but Anthropic's API.

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

Electron 44 · React 19 · TypeScript · Vite · esbuild (main/preload bundling) · electron-builder (packaging) · better-sqlite3 + sqlite-vec (FTS5 + vector search) · CLIP via `@huggingface/transformers`/onnxruntime-node · ffmpeg-static (video keyframes) · Anthropic SDK (search agent)
