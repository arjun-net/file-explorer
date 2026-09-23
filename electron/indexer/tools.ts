import type Database from "better-sqlite3";
import type {
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  IndexStats,
  VectorSearchParams,
  VectorSearchResult,
} from "../../shared/types";
import { embedText, toVecBuffer } from "./embeddings";

export type {
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  IndexStats,
  VectorSearchParams,
  VectorSearchResult,
};

interface FileRow {
  id: number;
  path: string;
  parent_dir: string;
  name: string;
  extension: string;
  is_directory: number;
  size: number;
  mtime: number;
  ctime: number;
}

function toFile(row: FileRow): IndexedFile {
  return {
    id: row.id,
    path: row.path,
    parentDir: row.parent_dir,
    name: row.name,
    extension: row.extension,
    isDirectory: !!row.is_directory,
    size: row.size,
    mtime: row.mtime,
    ctime: row.ctime,
  };
}

interface RollupRow {
  dir_path: string;
  file_count: number;
  dir_count: number;
  total_size: number;
  top_extensions: string;
  max_mtime: number;
  updated_at: number;
}

function toRollup(row: RollupRow): DirRollup {
  return {
    dirPath: row.dir_path,
    fileCount: row.file_count,
    dirCount: row.dir_count,
    totalSize: row.total_size,
    topExtensions: JSON.parse(row.top_extensions),
    maxMtime: row.max_mtime,
    updatedAt: row.updated_at,
  };
}

/**
 * Escapes an FTS5 query so free-text user/agent input can't break the MATCH
 * syntax — wraps the whole phrase in quotes and doubles internal quotes.
 */
function sanitizeFtsQuery(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

/** Full-text substring search over file/folder names and paths (trigram FTS5). */
export function keywordSearch(db: Database.Database, params: KeywordSearchParams): IndexedFile[] {
  const limit = Math.min(params.limit ?? 50, 500);
  const rows = params.rootPath
    ? (db
        .prepare(
          `SELECT f.* FROM files_fts
           JOIN files f ON f.id = files_fts.rowid
           WHERE files_fts MATCH ? AND f.path LIKE ? || '%'
           ORDER BY rank LIMIT ?`
        )
        .all(sanitizeFtsQuery(params.query), params.rootPath, limit) as FileRow[])
    : (db
        .prepare(
          `SELECT f.* FROM files_fts
           JOIN files f ON f.id = files_fts.rowid
           WHERE files_fts MATCH ?
           ORDER BY rank LIMIT ?`
        )
        .all(sanitizeFtsQuery(params.query), limit) as FileRow[]);
  return rows.map(toFile);
}

/** Structured search over size/date/type/location — no text query involved. */
export function metadataSearch(db: Database.Database, params: MetadataSearchParams): IndexedFile[] {
  const clauses: string[] = [];
  const args: (string | number)[] = [];

  if (params.rootPath) {
    clauses.push(`path LIKE ? || '%'`);
    args.push(params.rootPath);
  }
  if (params.extensions?.length) {
    clauses.push(`extension IN (${params.extensions.map(() => "?").join(",")})`);
    args.push(...params.extensions.map((e) => e.toLowerCase()));
  }
  if (params.minSize != null) {
    clauses.push(`size >= ?`);
    args.push(params.minSize);
  }
  if (params.maxSize != null) {
    clauses.push(`size <= ?`);
    args.push(params.maxSize);
  }
  if (params.modifiedAfter != null) {
    clauses.push(`mtime >= ?`);
    args.push(params.modifiedAfter);
  }
  if (params.modifiedBefore != null) {
    clauses.push(`mtime <= ?`);
    args.push(params.modifiedBefore);
  }
  if (params.isDirectory != null) {
    clauses.push(`is_directory = ?`);
    args.push(params.isDirectory ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(params.limit ?? 50, 500);
  const rows = db.prepare(`SELECT * FROM files ${where} ORDER BY mtime DESC LIMIT ?`).all(...args, limit) as FileRow[];
  return rows.map(toFile);
}

/** The rollup for one specific directory, or null if it hasn't been indexed. */
export function getDirRollup(db: Database.Database, dirPath: string): DirRollup | null {
  const row = db.prepare(`SELECT * FROM dir_rollups WHERE dir_path = ?`).get(dirPath) as RollupRow | undefined;
  return row ? toRollup(row) : null;
}

/**
 * Rollups for every immediate subdirectory of `dirPath` — the primary tool a
 * best-first search agent uses to decide which subtrees are worth exploring
 * before it descends into any of them.
 */
export function listSubdirRollups(db: Database.Database, dirPath: string): DirRollup[] {
  const subdirs = db.prepare(`SELECT path FROM files WHERE parent_dir = ? AND is_directory = 1`).all(dirPath) as {
    path: string;
  }[];
  const rollups: DirRollup[] = [];
  for (const { path: p } of subdirs) {
    const rollup = getDirRollup(db, p);
    if (rollup) rollups.push(rollup);
  }
  return rollups;
}

/**
 * Content-based search: embeds `query` with the same CLIP text encoder used
 * for images/video frames, then finds the nearest embeddings by (L2, on
 * unit-normalized vectors, so equivalent to cosine similarity) distance.
 * A video can match on any one of its sampled keyframes; results are
 * deduped to one row per file, keeping the closest match.
 */
export async function vectorSearch(db: Database.Database, params: VectorSearchParams): Promise<VectorSearchResult[]> {
  const queryVec = await embedText(params.query);
  const fetchLimit = Math.min((params.limit ?? 30) * 4, 400); // over-fetch before per-file dedup
  const rows = db
    .prepare(
      `SELECT f.*, em.kind AS matched_kind, em.frame_time AS matched_frame_time, e.distance AS distance
       FROM embeddings e
       JOIN embedding_meta em ON em.vec_rowid = e.rowid
       JOIN files f ON f.id = em.file_id
       WHERE e.embedding MATCH ? AND k = ? ${params.rootPath ? "AND f.path LIKE ? || '%'" : ""}
       ORDER BY e.distance`
    )
    .all(
      ...(params.rootPath ? [toVecBuffer(queryVec), fetchLimit, params.rootPath] : [toVecBuffer(queryVec), fetchLimit])
    ) as (FileRow & { matched_kind: "image" | "video_frame"; matched_frame_time: number | null; distance: number })[];

  const bestPerFile = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = bestPerFile.get(row.id);
    if (!existing || row.distance < existing.distance) bestPerFile.set(row.id, row);
  }

  const limit = Math.min(params.limit ?? 30, 200);
  return [...bestPerFile.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((row) => ({
      ...toFile(row),
      // Unit vectors: L2 distance^2 = 2 - 2*cosine_similarity.
      similarity: 1 - (row.distance * row.distance) / 2,
      matchedKind: row.matched_kind,
      matchedFrameTime: row.matched_frame_time,
    }));
}

export function getIndexStats(db: Database.Database): IndexStats {
  const row = db
    .prepare(`SELECT COUNT(*) FILTER (WHERE is_directory = 0) AS files, COUNT(*) FILTER (WHERE is_directory = 1) AS dirs, COALESCE(SUM(size), 0) AS size FROM files`)
    .get() as { files: number; dirs: number; size: number };
  const roots = db.prepare(`SELECT root_path FROM index_roots`).all() as { root_path: string }[];
  return { totalFiles: row.files, totalDirs: row.dirs, totalSize: row.size, indexedRoots: roots.map((r) => r.root_path) };
}
