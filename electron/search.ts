import fs from "node:fs/promises";
import path from "node:path";
import type { WebContents } from "electron";
import { statToEntry } from "./fsUtils";

const activeSearches = new Set<string>();

export function cancelSearch(requestId: string) {
  activeSearches.delete(requestId);
}

export async function runSearch(
  sender: WebContents,
  requestId: string,
  rootPath: string,
  query: string
): Promise<void> {
  activeSearches.add(requestId);
  const needle = query.toLowerCase();
  const MAX_RESULTS = 500;
  let found = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (!activeSearches.has(requestId) || found >= MAX_RESULTS || depth > 12) return;
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!activeSearches.has(requestId) || found >= MAX_RESULTS) return;
      if (name.startsWith(".")) continue;
      const full = path.join(dir, name);
      let entry;
      try {
        entry = await statToEntry(full);
      } catch {
        continue;
      }
      if (name.toLowerCase().includes(needle)) {
        found++;
        sender.send("search:result", { requestId, entry });
      }
      if (entry.isDirectory && !entry.isSymlink) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(rootPath, 0);
  activeSearches.delete(requestId);
  if (!sender.isDestroyed()) {
    sender.send("search:done", { requestId });
  }
}
