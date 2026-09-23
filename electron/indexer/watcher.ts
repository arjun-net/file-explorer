import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { rescanDirectory } from "./incremental";

const DEBOUNCE_MS = 500;

/** True if any path segment is hidden (dotfile/dotdir), which the walker also skips. */
function isHidden(relativePath: string): boolean {
  return relativePath.split(path.sep).some((segment) => segment.startsWith("."));
}

/**
 * Watches an indexed root for changes and keeps the index current by
 * re-scanning just the directory a change happened in (see incremental.ts),
 * not the whole tree. Bursts of events for the same directory (e.g. copying
 * in a folder of 200 files) are coalesced into a single rescan.
 *
 * Uses Node's native recursive fs.watch, which on macOS is a single FSEvents
 * stream for the whole tree. (Per-directory watchers, as libraries like
 * chokidar use, exhaust file descriptors with EMFILE on large trees.)
 */
export class IndexWatcher {
  private watcher: fs.FSWatcher | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  watch(rootPath: string): void {
    this.stop();

    const scheduleRescan = (dir: string) => {
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

    try {
      this.watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const relative = filename.toString();
        if (isHidden(relative)) return;
        scheduleRescan(path.dirname(path.join(rootPath, relative)));
      });
      // Live updates are a nice-to-have; a watcher failure must never take
      // down the app. The index simply stays as of the last scan.
      this.watcher.on("error", (err) => {
        console.error("[watcher] stopped:", err.message);
        this.stop();
      });
    } catch (err) {
      console.error("[watcher] could not start:", err instanceof Error ? err.message : err);
    }
  }

  stop(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.watcher?.close();
    this.watcher = null;
  }
}
