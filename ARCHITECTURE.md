# Architecture

Files is a desktop file explorer that's growing an **agentic search layer** on
top of normal browsing: a background indexer that knows what's on disk, and
(eventually) an LLM agent that can search that index the way a person would —
by name, by metadata, by what's actually *in* a photo or video, and by
deciding for itself which folders are worth looking in.

This document describes what exists today and what the remaining phases look
like. If you're picking this codebase up cold, read this before `src/` or
`electron/`.

## The three processes

Like any Electron app, there are two conceptual sides, plus one addition this
project makes:

- **Main process** (`electron/*.ts`) — Node.js. Owns the window, the
  filesystem, and now the search index.
- **Renderer** (`src/*.tsx`) — React. Never touches the filesystem or a
  database directly; everything goes through `window.fileAPI`, a bridge
  exposed by `electron/preload.ts` via `contextBridge`.
- **Indexer worker** (`electron/indexer/walker.worker.ts`) — a Node
  `worker_thread`, spawned by the main process. Does the actual disk-walking
  and metadata extraction off the UI thread, so scanning a large drive
  doesn't make the app janky.

```
Renderer (React)
   │  window.fileAPI.indexKeywordSearch(...)
   ▼
preload.ts  ──ipcRenderer.invoke──▶  ipc.ts (main process)
                                          │
                                          ▼
                                   SearchIndex (electron/indexer/index.ts)
                                    ├─ IndexerController ──spawns──▶ walker.worker.ts ──▶ SQLite
                                    ├─ IndexWatcher (chokidar) ──▶ incremental.ts ──▶ SQLite
                                    └─ tools.ts (read queries) ──▶ SQLite
```

## The index: what's built (Phase 1)

`electron/indexer/` is a self-contained subsystem — nothing in it imports
Electron APIs except through the thin `SearchIndex` wrapper, so it could be
unit-tested or reused outside this app.

### Schema (`db.ts`)

One SQLite database per user (`app.getPath("userData")/index.sqlite3`, WAL
mode so the worker can write while the renderer reads):

| Table | What it's for |
|---|---|
| `files` | One row per file/directory ever seen, keyed by absolute path. Size, mtime, ctime, extension, parent directory. |
| `files_fts` | FTS5 shadow table (trigram tokenizer, so it matches *substrings* like Finder's search does) over `files.name`/`files.path`, kept in sync by triggers. |
| `exif` | Optional 1:1 metadata for images — capture date, camera, GPS, dimensions. Populated by `exifr` (pure JS, no native dependency). |
| `dir_rollups` | One row per directory: file/dir counts, total size, and an extension histogram — **for that directory's direct children only, not recursive.** |
| `index_roots` | Top-level folders the user has asked to index. |

### Why `dir_rollups` is the interesting table

It's not there for the UI — it's there for the **search agent's benefit**
(Phase 3). An agent given a query like "that goose video" over a 4TB drive
can't `MATCH` its way to an answer with keyword search alone, and it
shouldn't have to open every folder to find out what's in it either. Instead
it can:

1. Ask for `listSubdirRollups(currentDir)` — one row per subfolder, no disk
   I/O, just a `dir_rollups` lookup.
2. Look at each rollup's extension histogram and size to decide which
   subfolders are even plausible (a folder that's 40 CSVs isn't going to have
   a goose video in it).
3. Recurse into the promising ones only, pruning the rest.

That's the "best-first search that prunes irrelevant subtrees" from the
project brief — it's implemented as a **tool the agent calls**, not a
traversal algorithm baked into the backend. The agent (Phase 3) drives it.

### The walker (`walker.worker.ts`)

Runs once per "index this folder" request, in its own thread with its own
SQLite connection (WAL mode lets it write concurrently with the main
process's read queries). It's a depth-first, post-order walk:

- For each entry: upsert into `files` (the `ON CONFLICT ... WHERE mtime !=
  excluded.mtime OR size != excluded.size` clause means unchanged files are a
  no-op, not a rewrite — this is what makes re-running the scan cheap).
- New/changed images get EXIF-extracted (skipped for unchanged ones, since
  that's the expensive part).
- After a directory's children are all processed, anything that *used* to be
  recorded under that directory but wasn't seen this pass gets deleted (files
  that were removed on disk since the last scan).
- Then that directory's `dir_rollups` row is written — after its children,
  which is what makes it a true post-order walk.

Progress is reported to the main process every ~400ms (`{processed,
currentPath}`), not per-file, so a fast SSD scan doesn't flood IPC.

### Keeping it current (`watcher.ts` + `incremental.ts`)

A full re-walk on every filesystem change would be wasteful. Instead,
`chokidar` watches each indexed root, and any change (add/remove/modify) is
debounced per-directory (500ms, coalescing bursts like "copied in 200
files") and handled by `rescanDirectory()` in `incremental.ts` — the same
upsert/prune/rollup logic as the walker, just for one directory, non-
recursive, run inline on the main process's own database connection instead
of spinning up a worker.

### The read-only tools (`tools.ts`)

These are what both the current UI and the future agent call:

- `keywordSearch({ query, rootPath?, limit? })` — substring match on
  name/path via FTS5.
- `metadataSearch({ extensions?, minSize?, maxSize?, modifiedAfter?, ... })`
  — structured filtering, no text query.
- `getDirRollup(path)` / `listSubdirRollups(path)` — the best-first-search
  primitives described above.
- `getIndexStats()` — total files/size/indexed roots, for the status UI.

They're plain functions over a `better-sqlite3` handle — deliberately not
classes or stateful objects, so they're easy to hand to an LLM tool-calling
loop as-is later.

## The UI today

A toolbar button (database icon) opens **Indexed Search**
(`src/components/SmartSearchPanel.tsx`): index the current folder, watch scan
progress live (`index:statusChanged` pushed from main to renderer), then
search instantly. Clicking a result navigates the normal file browser there.

This is explicitly a placeholder for the agent, not the final feature — see
Phase 3.

## Roadmap

**Phase 1 — done.** Everything above: indexer, watcher, rollups, keyword/
metadata search, EXIF capture, UI to drive it.

**Phase 2 — content-based media search (not yet built).** Embed images and
sampled video keyframes with a CLIP model (ONNX Runtime) into a vector index
(`sqlite-vec`), so a query like "white goose video" matches what's *in* the
file, not its filename. Needs: `sharp` for image preprocessing, `ffmpeg` (or
`ffmpeg-static`) for keyframe sampling, and downloading real CLIP ONNX
weights. This is a meaningful chunk of new work on its own and hasn't been
started.

**Phase 3 — the agent (not yet built, needs your input).** An LLM
tool-calling loop that takes a natural-language query, gets the tools in
`tools.ts` (plus vector search once Phase 2 lands), and decides for itself
how to search — this is what turns "type a keyword" into "describe what
you're looking for." This needs a provider/API key decision (Anthropic,
OpenAI, something else, and where the key is stored) before it can be built,
since the app can't invent credentials for you.

## Developing

```bash
npm install        # runs `electron-rebuild` automatically (postinstall) so
                    # better-sqlite3's native binding matches Electron's Node
                    # ABI, not your system Node's
npm run dev         # Vite + Electron with hot reload
npm run build       # renderer (Vite) + main/preload/worker (esbuild)
npm run dist        # packaged .dmg/.zip via electron-builder
```

If you ever see a `NODE_MODULE_VERSION` mismatch error mentioning
`better-sqlite3`, it means the native binding is built for the wrong Node —
run `npx electron-rebuild -f -w better-sqlite3`.
