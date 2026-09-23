import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { rescanDirectory } from "./incremental";
import { isIgnoredPath } from "./ignore";

const DEBOUNCE_MS = 500;

/**
 * Watches every indexed root for changes and keeps the index current by
 * re-scanning just the directory a change happened in (see incremental.ts),
 * not the whole tree. Bursts of events for the same directory (e.g. copying
 * in a folder of 200 files) are coalesced into a single rescan.
 *
 * Uses Node's native recursive fs.watch, which on macOS is a single FSEvents
 * stream per root. (Per-directory watchers, as libraries like chokidar use,
 * exhaust file descriptors with EMFILE on large trees.)
 *
 * `onChange(rootPath)` fires after a rescan lands, so the owner can react —
 * e.g. embed newly added photos, which incremental.ts deliberately doesn't do.
 */
export class IndexWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private db: Database.Database;
  private onChange: (rootPath: string) => void;

  constructor(db: Database.Database, onChange: (rootPath: string) => void) {
    this.db = db;
    this.onChange = onChange;
  }

  watch(rootPath: string): void {
    this.unwatch(rootPath);

    const scheduleRescan = (dir: string) => {
      const existing = this.pending.get(dir);
      if (existing) clearTimeout(existing);
      this.pending.set(
        dir,
        setTimeout(() => {
          this.pending.delete(dir);
          rescanDirectory(this.db, dir)
            .then(() => this.onChange(rootPath))
            .catch(() => {
              // Best-effort: a transient error here just means we'll catch up
              // on the next change event or the next launch's catch-up scan.
            });
        }, DEBOUNCE_MS)
      );
    };

    try {
      const watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const changed = path.join(rootPath, filename.toString());
        if (isIgnoredPath(changed)) return;
        scheduleRescan(path.dirname(changed));
      });
      // Live updates are a nice-to-have; a watcher failure must never take
      // down the app. The next launch's catch-up scan repairs any gap.
      watcher.on("error", (err) => {
        console.error(`[watcher] ${rootPath} stopped:`, err.message);
        this.unwatch(rootPath);
      });
      this.watchers.set(rootPath, watcher);
    } catch (err) {
      console.error(`[watcher] could not watch ${rootPath}:`, err instanceof Error ? err.message : err);
    }
  }

  unwatch(rootPath: string): void {
    this.watchers.get(rootPath)?.close();
    this.watchers.delete(rootPath);
  }

  stop(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
}
