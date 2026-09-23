import os from "node:os";
import path from "node:path";

/**
 * What the indexer skips. Shared by the walker, the incremental rescan and the
 * watcher so they always agree on what's "in" the index.
 *
 * Indexing a home folder otherwise spends most of its time (and most of its
 * "size") on things nobody searches for: dependency trees and app caches.
 */
const IGNORED_DIR_NAMES = new Set(["node_modules", "__pycache__", "Pods", ".git"]);
const HOME_LIBRARY = path.join(os.homedir(), "Library");

/** True if a directory entry should be left out of the index. */
export function isIgnoredEntry(parentDir: string, name: string): boolean {
  if (name.startsWith(".")) return true;
  if (IGNORED_DIR_NAMES.has(name)) return true;
  // ~/Library is app support data and caches, not user documents.
  return parentDir === os.homedir() && name === "Library";
}

/** True if any folder on the way to `fullPath` is ignored (for watcher events). */
export function isIgnoredPath(fullPath: string): boolean {
  if (fullPath === HOME_LIBRARY || fullPath.startsWith(HOME_LIBRARY + path.sep)) return true;
  return fullPath.split(path.sep).some((segment) => segment.startsWith(".") || IGNORED_DIR_NAMES.has(segment));
}
