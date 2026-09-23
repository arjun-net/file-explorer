import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import { openDatabase, prepareRemoveEntry } from "./db";
import { isIgnoredEntry } from "./ignore";

interface WorkerData {
  rootPath: string;
  dbPath: string;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "tiff", "webp"]);
const MAX_DEPTH = 60;
const PROGRESS_INTERVAL_MS = 400;

const { rootPath, dbPath } = workerData as WorkerData;
const db = openDatabase(dbPath);

const upsertFile = db.prepare(`
  INSERT INTO files (path, parent_dir, name, extension, is_directory, size, mtime, ctime, indexed_at)
  VALUES (@path, @parent_dir, @name, @extension, @is_directory, @size, @mtime, @ctime, @indexed_at)
  ON CONFLICT(path) DO UPDATE SET
    size = excluded.size, mtime = excluded.mtime, ctime = excluded.ctime, indexed_at = excluded.indexed_at
  WHERE files.mtime != excluded.mtime OR files.size != excluded.size
`);

const findFileId = db.prepare(`SELECT id FROM files WHERE path = ?`);
const listChildren = db.prepare(`SELECT name FROM files WHERE parent_dir = ?`);
const removeEntry = prepareRemoveEntry(db);

const upsertRollup = db.prepare(`
  INSERT INTO dir_rollups (dir_path, file_count, dir_count, total_size, top_extensions, max_mtime, updated_at)
  VALUES (@dir_path, @file_count, @dir_count, @total_size, @top_extensions, @max_mtime, @updated_at)
  ON CONFLICT(dir_path) DO UPDATE SET
    file_count = excluded.file_count, dir_count = excluded.dir_count, total_size = excluded.total_size,
    top_extensions = excluded.top_extensions, max_mtime = excluded.max_mtime, updated_at = excluded.updated_at
`);

const upsertExif = db.prepare(`
  INSERT INTO exif (file_id, taken_at, camera_make, camera_model, gps_lat, gps_lon, width, height, raw_json)
  VALUES (@file_id, @taken_at, @camera_make, @camera_model, @gps_lat, @gps_lon, @width, @height, @raw_json)
  ON CONFLICT(file_id) DO UPDATE SET
    taken_at = excluded.taken_at, camera_make = excluded.camera_make, camera_model = excluded.camera_model,
    gps_lat = excluded.gps_lat, gps_lon = excluded.gps_lon, width = excluded.width, height = excluded.height,
    raw_json = excluded.raw_json
`);

let processed = 0;
let lastReport = 0;

function report(currentPath: string) {
  const now = Date.now();
  if (now - lastReport < PROGRESS_INTERVAL_MS) return;
  lastReport = now;
  parentPort?.postMessage({ type: "progress", processed, currentPath });
}

async function extractExif(filePath: string, fileId: number) {
  try {
    const data = await exifr.parse(filePath, { gps: true, pick: ["Make", "Model", "DateTimeOriginal", "ExifImageWidth", "ExifImageHeight"] });
    if (!data) return;
    upsertExif.run({
      file_id: fileId,
      taken_at: data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.getTime() : null,
      camera_make: data.Make ?? null,
      camera_model: data.Model ?? null,
      gps_lat: typeof data.latitude === "number" ? data.latitude : null,
      gps_lon: typeof data.longitude === "number" ? data.longitude : null,
      width: data.ExifImageWidth ?? null,
      height: data.ExifImageHeight ?? null,
      raw_json: JSON.stringify(data),
    });
  } catch {
    // Not a readable/valid image for EXIF purposes; not fatal to indexing.
  }
}

async function walk(dir: string, depth: number): Promise<{ fileCount: number; dirCount: number; totalSize: number; extCounts: Record<string, number>; maxMtime: number }> {
  const rollup = { fileCount: 0, dirCount: 0, totalSize: 0, extCounts: {} as Record<string, number>, maxMtime: 0 };
  if (depth > MAX_DEPTH) return rollup;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return rollup; // permission denied, vanished, etc.
  }

  const seenNames = new Set<string>();

  for (const entry of entries) {
    if (isIgnoredEntry(dir, entry.name)) continue;
    const full = path.join(dir, entry.name);
    seenNames.add(entry.name);

    let stat;
    try {
      stat = await fs.lstat(full);
    } catch {
      continue;
    }

    const isSymlink = stat.isSymbolicLink();
    const isDirectory = isSymlink ? false : stat.isDirectory();
    const ext = isDirectory ? "" : path.extname(entry.name).slice(1).toLowerCase();
    const record = {
      path: full,
      parent_dir: dir,
      name: entry.name,
      extension: ext,
      is_directory: isDirectory ? 1 : 0,
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs),
      ctime: Math.floor(stat.birthtimeMs),
      indexed_at: Date.now(),
    };

    const result = upsertFile.run(record);
    processed++;
    report(dir);

    if (isDirectory) {
      rollup.dirCount++;
    } else {
      rollup.fileCount++;
      rollup.totalSize += stat.size;
      if (ext) rollup.extCounts[ext] = (rollup.extCounts[ext] ?? 0) + 1;
    }
    rollup.maxMtime = Math.max(rollup.maxMtime, record.mtime);

    // Only re-extract EXIF when the row was actually new or changed (result.changes > 0
    // for a fresh insert; the UPDATE clause only fires on real mtime/size changes).
    if (!isDirectory && IMAGE_EXTENSIONS.has(ext) && result.changes > 0) {
      const row = findFileId.get(full) as { id: number } | undefined;
      if (row) await extractExif(full, row.id);
    }

    if (isDirectory && !isSymlink) {
      await walk(full, depth + 1);
    }
  }

  // Anything previously recorded under `dir` that we didn't see this pass is gone.
  const existing = listChildren.all(dir) as { name: string }[];
  for (const child of existing) {
    if (!seenNames.has(child.name)) removeEntry(dir, child.name);
  }

  upsertRollup.run({
    dir_path: dir,
    file_count: rollup.fileCount,
    dir_count: rollup.dirCount,
    total_size: rollup.totalSize,
    top_extensions: JSON.stringify(rollup.extCounts),
    max_mtime: rollup.maxMtime,
    updated_at: Date.now(),
  });

  return rollup;
}

walk(rootPath, 0)
  .then(() => {
    parentPort?.postMessage({ type: "done", processed });
  })
  .catch((err: unknown) => {
    parentPort?.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  })
  .finally(() => {
    db.close();
  });
