import type Database from "better-sqlite3";
import fs from "node:fs";
import { openDatabase } from "./db";
import { IndexerController, type IndexStatus } from "./indexerController";
import { EmbeddingController, type EmbedStatus } from "./embeddingController";
import { IndexWatcher } from "./watcher";
import { configureModelCache } from "./embeddings";
import * as tools from "./tools";

export type { IndexStatus } from "./indexerController";
export type { EmbedStatus } from "./embeddingController";
export type {
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  IndexStats,
  VectorSearchParams,
  VectorSearchResult,
} from "./tools";

/** One unit of background work for a root: an optional full walk, then a CLIP embedding pass. */
interface IndexJob {
  rootPath: string;
  /** False for "embed only" jobs (triggered by the watcher, which already updated the files table). */
  scan: boolean;
}

/**
 * Facade over the database, the workers and the watcher.
 *
 * Background work is serialized through a small queue — one root at a time,
 * scan then embed — because each root's walk and embedding pass are heavy and
 * there is one embed model in memory. The watcher runs for every root for the
 * whole life of the app; see resume().
 */
export class SearchIndex {
  private db: Database.Database;
  private controller: IndexerController;
  private embeddingController: EmbeddingController;
  private watcher: IndexWatcher;
  private dbPath: string;
  private modelCacheDir: string;

  private queue: IndexJob[] = [];
  private current: IndexJob | null = null;
  private embedCatchUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    dbPath: string,
    modelCacheDir: string,
    onStatusChange: (status: IndexStatus) => void,
    onEmbedStatusChange: (status: EmbedStatus) => void
  ) {
    this.dbPath = dbPath;
    this.modelCacheDir = modelCacheDir;
    // content_search embeds the query text on this (main) thread, so it needs the
    // same writable model cache as the embed worker — the default is inside app.asar.
    configureModelCache(modelCacheDir);
    this.db = openDatabase(dbPath);
    this.watcher = new IndexWatcher(this.db, (rootPath) => this.scheduleEmbedCatchUp(rootPath));

    this.controller = new IndexerController((status) => {
      onStatusChange(status);
      if (status.state === "done" && this.current) {
        // Once the fast metadata scan finishes, kick off the slower CLIP
        // embedding pass for whatever media files it found. Kept as two
        // separate worker threads/phases on purpose — see ARCHITECTURE.md.
        this.embeddingController.start(this.current.rootPath, this.dbPath, this.modelCacheDir);
      } else if (status.state === "error") {
        this.finishCurrent();
      }
    });
    this.embeddingController = new EmbeddingController((status) => {
      onEmbedStatusChange(status);
      if (status.state === "done" || status.state === "error") this.finishCurrent();
    });
  }

  /**
   * Called once at launch: re-attach the watcher to every previously indexed
   * root and queue a catch-up scan for changes made while the app was closed.
   * Without this, the watcher would only exist after clicking "Index" again.
   */
  resume(): void {
    const roots = this.db.prepare(`SELECT root_path FROM index_roots ORDER BY added_at`).all() as { root_path: string }[];
    for (const { root_path } of roots) {
      if (!fs.existsSync(root_path)) continue; // e.g. an unmounted external drive
      this.watcher.watch(root_path);
      this.enqueue({ rootPath: root_path, scan: true });
    }
  }

  addRoot(rootPath: string): void {
    this.db
      .prepare(
        `INSERT INTO index_roots (root_path, added_at, status) VALUES (?, ?, 'scanning')
         ON CONFLICT(root_path) DO UPDATE SET status = 'scanning'`
      )
      .run(rootPath, Date.now());
    this.watcher.watch(rootPath);

    // A user click jumps the queue: interrupt whatever is running (it goes
    // back in line to be redone) so the folder they asked for starts now.
    const interrupted = this.current;
    this.controller.cancel();
    this.embeddingController.cancel();
    this.current = null;
    this.queue = this.queue.filter((j) => j.rootPath !== rootPath);
    this.queue.unshift({ rootPath, scan: true });
    if (interrupted && interrupted.rootPath !== rootPath) this.queue.push(interrupted);
    this.pump();
  }

  removeRoot(rootPath: string): void {
    this.watcher.unwatch(rootPath);
    this.queue = this.queue.filter((j) => j.rootPath !== rootPath);
    if (this.current?.rootPath === rootPath) {
      this.controller.cancel();
      this.embeddingController.cancel();
      this.current = null;
    }
    this.db.prepare(`DELETE FROM index_roots WHERE root_path = ?`).run(rootPath);
    this.pump();
  }

  private enqueue(job: IndexJob): void {
    const existing = this.queue.find((j) => j.rootPath === job.rootPath);
    if (existing) existing.scan = existing.scan || job.scan;
    else this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    if (this.current) return;
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    if (next.scan) this.controller.start(next.rootPath, this.dbPath);
    else this.embeddingController.start(next.rootPath, this.dbPath, this.modelCacheDir);
  }

  private finishCurrent(): void {
    this.current = null;
    this.pump();
  }

  /**
   * The watcher keeps the files table current but doesn't embed. Wait for a
   * quiet moment after the last change (a copy of 500 photos is one pass, not
   * 500), then queue an embed-only job — cheap when nothing new needs it.
   */
  private scheduleEmbedCatchUp(rootPath: string): void {
    const existing = this.embedCatchUpTimers.get(rootPath);
    if (existing) clearTimeout(existing);
    this.embedCatchUpTimers.set(
      rootPath,
      setTimeout(() => {
        this.embedCatchUpTimers.delete(rootPath);
        this.enqueue({ rootPath, scan: false });
      }, 3000)
    );
  }

  getStatus(): IndexStatus {
    return this.controller.getStatus();
  }

  getEmbedStatus(): EmbedStatus {
    return this.embeddingController.getStatus();
  }

  getStats() {
    return tools.getIndexStats(this.db);
  }

  keywordSearch(params: tools.KeywordSearchParams) {
    return tools.keywordSearch(this.db, params);
  }

  metadataSearch(params: tools.MetadataSearchParams) {
    return tools.metadataSearch(this.db, params);
  }

  vectorSearch(params: tools.VectorSearchParams) {
    return tools.vectorSearch(this.db, params);
  }

  getDirRollup(dirPath: string) {
    return tools.getDirRollup(this.db, dirPath);
  }

  listSubdirRollups(dirPath: string) {
    return tools.listSubdirRollups(this.db, dirPath);
  }

  close(): void {
    for (const timer of this.embedCatchUpTimers.values()) clearTimeout(timer);
    this.controller.cancel();
    this.embeddingController.cancel();
    this.watcher.stop();
    this.db.close();
  }
}
