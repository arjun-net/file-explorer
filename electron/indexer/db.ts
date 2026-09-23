import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Schema overview
 * ----------------
 * files        — one row per file/directory ever seen, keyed by absolute path.
 * files_fts    — FTS5 shadow index over files.name/files.path for keyword search,
 *                kept in sync by triggers so callers never touch it directly.
 * exif         — optional per-image metadata (camera, GPS, capture time), 1:1 with files.
 * dir_rollups  — per-directory aggregate stats over that directory's *direct* children
 *                only (not recursive). This is what lets the search agent do a
 *                best-first walk: look at a folder's rollup, decide whether it's worth
 *                descending into, without opening every file inside it.
 * index_roots  — top-level folders the user has asked to index, plus scan bookkeeping.
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
  `);
}

export function getDefaultDbPath(userDataDir: string): string {
  fs.mkdirSync(userDataDir, { recursive: true });
  return path.join(userDataDir, "index.sqlite3");
}

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  migrate(db);
  return db;
}
