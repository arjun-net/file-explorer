import type Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "tiff", "webp"]);

/**
 * Re-scans a single directory (non-recursive) and updates its `files` rows and
 * `dir_rollups` entry. Used by the filesystem watcher to keep the index current
 * without re-walking the whole tree on every change — a full worker-thread walk
 * is for the initial scan; this is for "one folder just changed" upkeep.
 */
export async function rescanDirectory(db: Database.Database, dir: string): Promise<void> {
  const upsertFile = db.prepare(`
    INSERT INTO files (path, parent_dir, name, extension, is_directory, size, mtime, ctime, indexed_at)
    VALUES (@path, @parent_dir, @name, @extension, @is_directory, @size, @mtime, @ctime, @indexed_at)
    ON CONFLICT(path) DO UPDATE SET
      size = excluded.size, mtime = excluded.mtime, ctime = excluded.ctime, indexed_at = excluded.indexed_at
    WHERE files.mtime != excluded.mtime OR files.size != excluded.size
  `);
  const findFileId = db.prepare(`SELECT id FROM files WHERE path = ?`);
  const listChildren = db.prepare(`SELECT name FROM files WHERE parent_dir = ?`);
  const deleteChild = db.prepare(`DELETE FROM files WHERE parent_dir = ? AND name = ?`);
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

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Directory vanished (deleted). Drop everything we had for it.
    const existing = listChildren.all(dir) as { name: string }[];
    for (const child of existing) deleteChild.run(dir, child.name);
    db.prepare(`DELETE FROM dir_rollups WHERE dir_path = ?`).run(dir);
    return;
  }

  const seenNames = new Set<string>();
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;
  let maxMtime = 0;
  const extCounts: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
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

    if (isDirectory) dirCount++;
    else {
      fileCount++;
      totalSize += stat.size;
      if (ext) extCounts[ext] = (extCounts[ext] ?? 0) + 1;
    }
    maxMtime = Math.max(maxMtime, record.mtime);

    if (!isDirectory && IMAGE_EXTENSIONS.has(ext) && result.changes > 0) {
      const row = findFileId.get(full) as { id: number } | undefined;
      if (row) {
        try {
          const data = await exifr.parse(full, {
            gps: true,
            pick: ["Make", "Model", "DateTimeOriginal", "ExifImageWidth", "ExifImageHeight"],
          });
          if (data) {
            upsertExif.run({
              file_id: row.id,
              taken_at: data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.getTime() : null,
              camera_make: data.Make ?? null,
              camera_model: data.Model ?? null,
              gps_lat: typeof data.latitude === "number" ? data.latitude : null,
              gps_lon: typeof data.longitude === "number" ? data.longitude : null,
              width: data.ExifImageWidth ?? null,
              height: data.ExifImageHeight ?? null,
              raw_json: JSON.stringify(data),
            });
          }
        } catch {
          // Not a decodable image for EXIF purposes; ignore.
        }
      }
    }
  }

  const existing = listChildren.all(dir) as { name: string }[];
  for (const child of existing) {
    if (!seenNames.has(child.name)) deleteChild.run(dir, child.name);
  }

  upsertRollup.run({
    dir_path: dir,
    file_count: fileCount,
    dir_count: dirCount,
    total_size: totalSize,
    top_extensions: JSON.stringify(extCounts),
    max_mtime: maxMtime,
    updated_at: Date.now(),
  });
}
