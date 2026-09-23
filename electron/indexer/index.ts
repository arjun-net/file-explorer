import type Database from "better-sqlite3";
import { openDatabase } from "./db";
import { IndexerController, type IndexStatus } from "./indexerController";
import { EmbeddingController, type EmbedStatus } from "./embeddingController";
import { IndexWatcher } from "./watcher";
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

export class SearchIndex {
  private db: Database.Database;
  private controller: IndexerController;
  private embeddingController: EmbeddingController;
  private watcher: IndexWatcher;
  private dbPath: string;
  private modelCacheDir: string;

  constructor(
    dbPath: string,
    modelCacheDir: string,
    onStatusChange: (status: IndexStatus) => void,
    onEmbedStatusChange: (status: EmbedStatus) => void
  ) {
    this.dbPath = dbPath;
    this.modelCacheDir = modelCacheDir;
    this.db = openDatabase(dbPath);
    this.watcher = new IndexWatcher(this.db);

    this.controller = new IndexerController((status) => {
      onStatusChange(status);
      // Once the fast metadata scan finishes, kick off the slower CLIP
      // embedding pass for whatever media files it found. Kept as two
      // separate worker threads/phases on purpose — see ARCHITECTURE.md.
      if (status.state === "done" && status.rootPath) {
        this.embeddingController.start(status.rootPath, this.dbPath, this.modelCacheDir);
      }
    });
    this.embeddingController = new EmbeddingController(onEmbedStatusChange);
  }

  addRoot(rootPath: string): void {
    this.db
      .prepare(
        `INSERT INTO index_roots (root_path, added_at, status) VALUES (?, ?, 'scanning')
         ON CONFLICT(root_path) DO UPDATE SET status = 'scanning'`
      )
      .run(rootPath, Date.now());
    this.controller.start(rootPath, this.dbPath);
    this.watcher.watch(rootPath);
  }

  removeRoot(rootPath: string): void {
    this.controller.cancel();
    this.embeddingController.cancel();
    this.watcher.stop();
    this.db.prepare(`DELETE FROM index_roots WHERE root_path = ?`).run(rootPath);
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
    this.controller.cancel();
    this.embeddingController.cancel();
    this.watcher.stop();
    this.db.close();
  }
}
