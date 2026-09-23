import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";

/**
 * Schema overview
 * ----------------
 * files          — one row per file/directory ever seen, keyed by absolute path.
 * files_fts      — FTS5 shadow index over files.name/files.path for keyword search,
 *                  kept in sync by triggers so callers never touch it directly.
 * exif           — optional per-image metadata (camera, GPS, capture time), 1:1 with files.
 * dir_rollups    — per-directory aggregate stats over that directory's *direct* children
 *                  only (not recursive). This is what lets the search agent do a
 *                  best-first walk: look at a folder's rollup, decide whether it's worth
 *                  descending into, without opening every file inside it.
 * index_roots    — top-level folders the user has asked to index, plus scan bookkeeping.
 * embeddings     — a sqlite-vec vec0 table of 512-dim CLIP embeddings (image files get one
 *                  row, videos get one row per sampled keyframe). Vector-only; everything
 *                  else about the embedding lives in embedding_meta, joined by rowid,
 *                  because vec0 tables don't carry arbitrary extra columns well.
 * embedding_meta — which file/frame each embeddings row belongs to, and the file's mtime
 *                  at embedding time (so a changed file's stale embedding can be detected
 *                  and redone without re-embedding everything).
 */
export function migrate(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      parent_dir TEXT NOT NULL,
      name TEXT NOT NULL,
      extension TEXT NOT NULL DEFAULT '',
      is_directory INTEGER NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mtime INTEGER NOT NULL,
      ctime INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_dir);
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
    CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      name, path,
      content='files', content_rowid='id',
      tokenize='trigram'
    );

    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
    END;
    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, path) VALUES('delete', old.id, old.name, old.path);
    END;
    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, path) VALUES('delete', old.id, old.name, old.path);
      INSERT INTO files_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
    END;

    CREATE TABLE IF NOT EXISTS exif (
      file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      taken_at INTEGER,
      camera_make TEXT,
      camera_model TEXT,
      gps_lat REAL,
      gps_lon REAL,
      width INTEGER,
      height INTEGER,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS dir_rollups (
      dir_path TEXT PRIMARY KEY,
      file_count INTEGER NOT NULL DEFAULT 0,
      dir_count INTEGER NOT NULL DEFAULT 0,
      total_size INTEGER NOT NULL DEFAULT 0,
      top_extensions TEXT NOT NULL DEFAULT '{}',
      max_mtime INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS index_roots (
      root_path TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL,
      last_full_scan_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS embedding_meta (
      vec_rowid INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      frame_time REAL,
      file_mtime INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_meta_file ON embedding_meta(file_id);
  `);

  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(embedding float[512])`);
}

export function getDefaultDbPath(userDataDir: string): string {
  fs.mkdirSync(userDataDir, { recursive: true });
  return path.join(userDataDir, "index.sqlite3");
}

/**
 * sqlite-vec locates its native .dylib/.so/.dll via require.resolve(), which
 * — inside a packaged, asar-archived app — still reports a path under
 * `app.asar/...` even for files electron-builder physically unpacked to
 * `app.asar.unpacked/...` (that automatic packed→unpacked redirection is a
 * Node require()/fs trick; it doesn't apply to a raw path string handed to
 * a native dlopen() call, which is what loading a SQLite extension is).
 * Redirect manually so this works both in dev (no asar involved, no-op) and
 * in the packaged app.
 */
function resolveExtensionPath(): string {
  const resolved = sqliteVec.getLoadablePath();
  return resolved.replace(/\.asar([\\/])/, ".asar.unpacked$1");
}

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.loadExtension(resolveExtensionPath());
  migrate(db);
  return db;
}
