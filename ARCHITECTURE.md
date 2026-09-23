# Architecture

Files is a desktop file explorer with an **agentic search layer** on top of
normal browsing: a background indexer that knows what's on disk, and an LLM
agent that searches it the way a person would — by name, by metadata, by
what's actually *in* a photo or video, deciding for itself which folders are
worth looking in rather than scanning everything.

This document describes how it's built. If you're picking this codebase up
cold, read this before `src/` or `electron/`.

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
- **Embedding worker** (`electron/indexer/embed.worker.ts`) — a second,
  separate `worker_thread` that runs CLIP inference over images/video
  keyframes. Kept apart from the walker on purpose: the metadata walk is
  fast and should finish quickly; embedding is much slower model inference
  and shouldn't hold up basic keyword search from becoming available.

```
Renderer (React)
   │  window.fileAPI.indexKeywordSearch(...) / indexVectorSearch(...) / agentQuery(...)
   ▼
preload.ts  ──ipcRenderer.invoke──▶  ipc.ts (main process)
                                          │
                                          ├────────────────────────────────────────┐
                                          ▼                                        ▼
                                   SearchIndex (electron/indexer/index.ts)   runAgent (electron/agent/agentLoop.ts)
                                    ├─ IndexerController ──spawns──▶ walker.worker.ts ──▶ SQLite       │ tool_use loop against
                                    │                                      │ (on 'done', chains into ↓)│ the Anthropic API,
                                    ├─ EmbeddingController ──spawns──▶ embed.worker.ts ──▶ SQLite       │ dispatched via
                                    │                                      │ uses embeddings.ts (CLIP) + video.ts (ffmpeg)
                                    ├─ IndexWatcher (fs.watch) ──▶ incremental.ts ──▶ SQLite            │
                                    └─ tools.ts (read queries, incl. vectorSearch) ──▶ SQLite  ◀────────┘ electron/agent/tools.ts
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
| `embeddings` | A `sqlite-vec` `vec0` table of 512-dim CLIP embeddings — one row per image, one row per sampled video keyframe. |
| `embedding_meta` | Which file/frame each `embeddings` row belongs to (`vec0` tables can't carry extra columns well, so this is a normal table joined by rowid), plus the file's mtime at embedding time so a changed file's stale embedding gets detected and redone. |

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
a native recursive `fs.watch` (a single FSEvents stream on macOS, so large trees don't hit EMFILE) watches each indexed root, and any change (add/remove/modify) is
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

## Content search: what's built (Phase 2)

The point of this phase, straight from the project brief: a query like
**"white goose video" should match what's in the file, not its name.**
Verified working end-to-end against files named `IMG_0001.jpg` etc. — see
the commit that added this for the exact test.

### The model (`embeddings.ts`)

CLIP ViT-B/32 (quantized, ~150MB total) via
[`@huggingface/transformers`](https://github.com/huggingface/transformers.js),
running fully locally through `onnxruntime-node` — the only network access
is the one-time model download on first use, cached under
`app.getPath("userData")/models`. That library was a deliberate choice over
hand-rolling ONNX calls: it already implements the CLIP tokenizer and image
preprocessing correctly, which is easy to get subtly wrong from scratch.

Images and text queries land in the *same* 512-dim embedding space. Every
vector is L2-normalized before storage, so plain Euclidean distance (what
`sqlite-vec`'s `vec0` uses by default) ranks results identically to cosine
similarity would — no custom distance metric needed.

### Video (`video.ts`)

`ffmpeg-static` (a bundled binary, no system ffmpeg required) samples one
frame every 8 seconds, capped at 8 frames/video, via a single `fps=1/8`
filter invocation — no duration probing needed, ffmpeg just produces fewer
frames for short videos. Each frame gets its own embedding row, so a search
can match *when* something appears in a video, not just whether it does
(the UI shows this as a "@34s" badge on video results).

### The embedding worker (`embed.worker.ts`)

Runs after the metadata walker finishes for a root (`SearchIndex` chains
them in `index.ts`). Selects image/video files under that root whose newest
`embedding_meta.file_mtime` doesn't match the file's current mtime —
covering both "never embedded" and "changed since last embedded" — embeds
only those, and deletes+replaces any of that file's old embedding rows
first. Confirmed by test: re-running against an unchanged directory
processes 0 files.

### The tool (`tools.vectorSearch`)

The one async function in `tools.ts` (everything else is a sync
`better-sqlite3` call) — it has to embed the query text before it can query.
A video can match on any one of its keyframes; results are deduped to the
single best-matching row per file before being returned.

## The UI today

A toolbar button (database icon) opens **Indexed Search**
(`src/components/SmartSearchPanel.tsx`) with three modes:

- **Ask** — the agent. Type a plain-language description, watch it decide
  live which tools to call and why, get back a summary and a ranked list of
  files.
- **Name** — direct FTS5 keyword search, no LLM involved.
- **Content** — direct CLIP vector search, no LLM involved.

Name and Content aren't legacy — they're the same tools the agent uses,
just invoked by hand. They stay useful (instant, free, no API key needed)
for when you already know exactly what you want and don't need something
deciding how to search on your behalf.

## Roadmap

**Phase 1 — done.** Indexer, watcher, rollups, keyword/metadata search,
EXIF capture, UI to drive it.

**Phase 2 — done.** CLIP embeddings for images and sampled video keyframes,
`sqlite-vec` vector search, content-based search UI.

**Phase 3 — done, pending your API key.** The actual agent.

## The agent (Phase 3)

`electron/agent/` is two files:

- **`tools.ts`** — `AGENT_TOOLS`, the Anthropic tool-use schema for
  `keyword_search`, `content_search`, `metadata_search`,
  `list_subdir_rollups`, and `get_dir_rollup` (a direct 1:1 mapping onto
  `electron/indexer/tools.ts`), plus one more: `report_results`. That last
  one isn't a real search tool — it's the loop's *terminal* tool, which the
  agent is instructed to call exactly once to hand back a structured
  `{summary, files}` answer instead of free text, so the UI has something
  reliable to render rather than trying to parse prose.
- **`agentLoop.ts`** — `runAgent(apiKey, query, currentPath, index, onStep)`.
  A standard tool-calling loop against the Anthropic Messages API (model:
  `claude-sonnet-5`, capped at 10 iterations): send the conversation, execute
  every `tool_use` block the model asks for via `executeTool`, feed the
  results back as `tool_result` blocks, repeat until `report_results` is
  called (or the iteration cap is hit, or the API call itself fails). Every
  step — each tool call, each tool result, any interim text, the final
  answer, any error — is reported through the `onStep` callback as it
  happens, not just returned at the end, which is what lets the UI show a
  live transcript instead of a spinner.

The system prompt tells the agent what's currently indexed and nudges it
toward the `list_subdir_rollups` best-first pattern from Phase 1 rather than
brute-force searching everything — but nothing stops it from just calling
`keyword_search` or `content_search` directly when that's the better fit for
the query. Which tool(s) to use, and in what order, is entirely the model's
call.

**The API key** never round-trips to the renderer once set. `electron/
settings.ts` (`SettingsStore`) encrypts it via Electron's `safeStorage`
(OS-keychain-backed — Keychain on macOS, DPAPI on Windows, libsecret on
Linux) before writing it to `userData/secrets.enc`; the IPC surface
(`settings:setApiKey` / `hasApiKey` / `clearApiKey`) only ever exposes
*whether* a key is configured, never the key itself. Set it via the gear
icon in the toolbar.

**Verified without a real key:** the `safeStorage` encrypt/decrypt round-trip
(works on this machine), and the full request path against Anthropic's real
API with an intentionally invalid key — it reached the server, got a clean
`401 authentication_error` back, and the loop turned that into a proper
`{type: "error"}` step rather than crashing or hanging. That confirms the
SDK wiring, model id, and request shape are all correct; the only thing
untested is a *successful* tool-calling run, which needs a real key.

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

The CLIP model (~150MB) is **not** downloaded by `npm install` — it downloads
lazily the first time anything gets embedded (i.e. the first time a folder
you index contains an image or video), and is cached under
`app.getPath("userData")/models` from then on. `onnxruntime-node` and
`sqlite-vec` ship prebuilt platform binaries via `optionalDependencies` and
need no rebuild step of their own.
