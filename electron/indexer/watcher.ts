import type Database from "better-sqlite3";
import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { rescanDirectory } from "./incremental";

const DEBOUNCE_MS = 500;

/**
 * Watches an indexed root for changes and keeps the index current by
 * re-scanning just the directory a change happened in (see incremental.ts),
 * not the whole tree. Bursts of events for the same directory (e.g. copying
 * in a folder of 200 files) are coalesced into a single rescan.
 */
export class IndexWatcher {
  private watcher: FSWatcher | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  watch(rootPath: string): void {
    this.stop();
    this.watcher = chokidar.watch(rootPath, {
      ignoreInitial: true,
      ignored: (p: string) => path.basename(p).startsWith("."),
      depth: undefined,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    const scheduleRescan = (changedPath: string) => {
      const dir = path.dirname(changedPath);
      const existing = this.pending.get(dir);
      if (existing) clearTimeout(existing);
      this.pending.set(
        dir,
        setTimeout(() => {
          this.pending.delete(dir);
          rescanDirectory(this.db, dir).catch(() => {
            // Best-effort: a transient error here just means we'll catch up
            // on the next change event or full rescan.
          });
        }, DEBOUNCE_MS)
      );
    };

    this.watcher
      .on("add", scheduleRescan)
      .on("unlink", scheduleRescan)
      .on("addDir", scheduleRescan)
      .on("unlinkDir", scheduleRescan)
      .on("change", scheduleRescan);
  }

  stop(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.watcher?.close();
    this.watcher = null;
  }
}
