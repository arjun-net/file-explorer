import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "./db";
import { configureModelCache, embedImageFile, embedImageFiles, toVecBuffer } from "./embeddings";
import { extractKeyframes, cleanupFrames } from "./video";

interface WorkerData {
  rootPath: string;
  dbPath: string;
  modelCacheDir: string;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "tiff", "webp", "bmp", "gif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm"]);
const PROGRESS_INTERVAL_MS = 500;

const { rootPath, dbPath, modelCacheDir } = workerData as WorkerData;
configureModelCache(modelCacheDir);
const db = openDatabase(dbPath);

interface Candidate {
  id: number;
  path: string;
  extension: string;
  mtime: number;
}

// A single SQL query can't cheaply express "any embedding row exists with a
// matching mtime" across both image (1 row) and video (N rows) files, so
// candidate selection happens in JS: pull every media file under the root,
// then diff against what's already embedded and still current.
function selectStaleOrMissing(): Candidate[] {
  const media = db
    .prepare(
      `SELECT id, path, extension, mtime FROM files
       WHERE is_directory = 0 AND path LIKE ? || '%'
       AND extension IN (${[...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map(() => "?").join(",")})`
    )
    .all(rootPath, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS) as Candidate[];

  const embeddedMtimes = new Map<number, number>();
  for (const row of db.prepare(`SELECT file_id, MAX(file_mtime) AS mtime FROM embedding_meta GROUP BY file_id`).all() as {
    file_id: number;
    mtime: number;
  }[]) {
    embeddedMtimes.set(row.file_id, row.mtime);
  }

  return media.filter((f) => embeddedMtimes.get(f.id) !== f.mtime);
}

const deleteOldEmbeddings = db.prepare(`
  DELETE FROM embeddings WHERE rowid IN (SELECT vec_rowid FROM embedding_meta WHERE file_id = ?)
`);
const deleteOldMeta = db.prepare(`DELETE FROM embedding_meta WHERE file_id = ?`);
const insertEmbedding = db.prepare(`INSERT INTO embeddings(embedding) VALUES (?)`);
const insertMeta = db.prepare(`
  INSERT INTO embedding_meta (vec_rowid, file_id, kind, frame_time, file_mtime, created_at)
  VALUES (@vec_rowid, @file_id, @kind, @frame_time, @file_mtime, @created_at)
`);

function storeEmbedding(fileId: number, kind: "image" | "video_frame", frameTime: number | null, vec: Float32Array) {
  const result = insertEmbedding.run(toVecBuffer(vec));
  insertMeta.run({
    vec_rowid: result.lastInsertRowid,
    file_id: fileId,
    kind,
    frame_time: frameTime,
    file_mtime: currentFileMtime,
    created_at: Date.now(),
  });
}

// Set per-file right before storing so storeEmbedding doesn't need it threaded
// through every call site.
let currentFileMtime = 0;

let processed = 0;
let lastReport = 0;
function report(currentPath: string, total: number) {
  const now = Date.now();
  if (now - lastReport < PROGRESS_INTERVAL_MS) return;
  lastReport = now;
  parentPort?.postMessage({ type: "progress", processed, total, currentPath });
}

async function run() {
  const candidates = selectStaleOrMissing();
  const total = candidates.length;
  parentPort?.postMessage({ type: "progress", processed: 0, total, currentPath: rootPath });

  const tx_deleteOld = db.transaction((fileId: number) => {
    deleteOldEmbeddings.run(fileId);
    deleteOldMeta.run(fileId);
  });

  for (const file of candidates) {
    currentFileMtime = file.mtime;
    tx_deleteOld(file.id);

    try {
      if (IMAGE_EXTENSIONS.has(file.extension)) {
        const vec = await embedImageFile(file.path);
        storeEmbedding(file.id, "image", null, vec);
      } else if (VIDEO_EXTENSIONS.has(file.extension)) {
        const frames = await extractKeyframes(file.path);
        if (frames.length > 0) {
          const vecs = await embedImageFiles(frames.map((f) => f.path));
          vecs.forEach((vec, i) => storeEmbedding(file.id, "video_frame", frames[i].timeSeconds, vec));
          await cleanupFrames(frames);
        }
      }
    } catch {
      // Unreadable/corrupt media file — skip it, not fatal to the rest of the queue.
    }

    processed++;
    report(file.path, total);
  }

  parentPort?.postMessage({ type: "done", processed, total });
}

run()
  .catch((err: unknown) => {
    parentPort?.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  })
  .finally(() => {
    db.close();
  });
