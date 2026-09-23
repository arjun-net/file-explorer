import type Database from "better-sqlite3";
import { openDatabase } from "./db";
import { IndexerController, type IndexStatus } from "./indexerController";
import { IndexWatcher } from "./watcher";
import * as tools from "./tools";

export type { IndexStatus } from "./indexerController";
export type { IndexedFile, DirRollup, KeywordSearchParams, MetadataSearchParams, IndexStats } from "./tools";

export class SearchIndex {
  private db: Database.Database;
  private controller: IndexerController;
  private watcher: IndexWatcher;
  private dbPath: string;

  constructor(dbPath: string, onStatusChange: (status: IndexStatus) => void) {
    this.dbPath = dbPath;
    this.db = openDatabase(dbPath);
    this.controller = new IndexerController(onStatusChange);
    this.watcher = new IndexWatcher(this.db);
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
    this.watcher.stop();
    this.db.prepare(`DELETE FROM index_roots WHERE root_path = ?`).run(rootPath);
  }

  getStatus(): IndexStatus {
    return this.controller.getStatus();
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

  getDirRollup(dirPath: string) {
    return tools.getDirRollup(this.db, dirPath);
  }

  listSubdirRollups(dirPath: string) {
    return tools.listSubdirRollups(this.db, dirPath);
  }

  close(): void {
    this.controller.cancel();
    this.watcher.stop();
    this.db.close();
  }
}
