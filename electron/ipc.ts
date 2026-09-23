import { ipcMain, shell, dialog, app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import {
  listDir,
  statToEntry,
  getHome,
  getQuickAccess,
  getVolumes,
  createFolder,
  createFile,
  renameEntry,
  copyEntries,
  moveEntries,
} from "./fsUtils";
import { runSearch, cancelSearch } from "./search";
import type { SearchIndex } from "./indexer";
import type { KeywordSearchParams, MetadataSearchParams, VectorSearchParams } from "./indexer/tools";
import type { SettingsStore } from "./settings";
import { runAgent } from "./agent/agentLoop";

const watchers = new Map<number, fssync.FSWatcher>();
const activeAgentRuns = new Set<string>();

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: NodeJS.Timeout | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function registerIpcHandlers(searchIndex: SearchIndex, settings: SettingsStore) {
  ipcMain.handle("fs:listDir", (_e, dirPath: string) => listDir(dirPath));
  ipcMain.handle("fs:stat", (_e, p: string) => statToEntry(p));
  ipcMain.handle("fs:getHome", () => getHome());
  ipcMain.handle("fs:getQuickAccess", () => getQuickAccess());
  ipcMain.handle("fs:getVolumes", () => getVolumes());

  ipcMain.handle("fs:createFolder", (_e, parentDir: string, baseName?: string) =>
    createFolder(parentDir, baseName)
  );
  ipcMain.handle("fs:createFile", (_e, parentDir: string, baseName?: string) =>
    createFile(parentDir, baseName)
  );
  ipcMain.handle("fs:rename", (_e, fullPath: string, newName: string) => renameEntry(fullPath, newName));

  ipcMain.handle("fs:delete", async (_e, paths: string[]) => {
    for (const p of paths) {
      await shell.trashItem(p);
    }
  });

  ipcMain.handle("fs:copy", async (_e, srcPaths: string[], destDir: string) => {
    await copyEntries(srcPaths, destDir);
  });

  ipcMain.handle("fs:move", async (_e, srcPaths: string[], destDir: string) => {
    await moveEntries(srcPaths, destDir);
  });

  ipcMain.handle("fs:openPath", async (_e, p: string) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });

  ipcMain.handle("fs:showInFolder", (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle("fs:readTextPreview", async (_e, p: string, maxBytes = 64 * 1024) => {
    const fh = await fs.open(p, "r");
    try {
      const stat = await fh.stat();
      const size = Math.min(stat.size, maxBytes);
      const buffer = Buffer.alloc(size);
      await fh.read(buffer, 0, size, 0);
      return { text: buffer.toString("utf-8"), truncated: stat.size > maxBytes, size: stat.size };
    } finally {
      await fh.close();
    }
  });

  ipcMain.handle("dialog:pickDirectory", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("search:start", (e, requestId: string, rootPath: string, query: string) => {
    runSearch(e.sender, requestId, rootPath, query);
  });
  ipcMain.handle("search:cancel", (_e, requestId: string) => {
    cancelSearch(requestId);
  });

  ipcMain.handle("fs:watch", (e, dirPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const winId = win.id;
    const existing = watchers.get(winId);
    if (existing) {
      existing.close();
      watchers.delete(winId);
    }
    try {
      const notify = debounce(() => {
        if (!win.isDestroyed()) {
          win.webContents.send("fs:changed", { path: dirPath });
        }
      }, 150);
      const watcher = fssync.watch(dirPath, { persistent: false }, notify);
      watchers.set(winId, watcher);
    } catch {
      // Directory may not support watching (e.g. some network mounts); ignore.
    }
  });

  ipcMain.handle("fs:unwatch", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const existing = watchers.get(win.id);
    if (existing) {
      existing.close();
      watchers.delete(win.id);
    }
  });

  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getPathSeparator", () => path.sep);

  ipcMain.handle("index:addRoot", (_e, rootPath: string) => searchIndex.addRoot(rootPath));
  ipcMain.handle("index:removeRoot", (_e, rootPath: string) => searchIndex.removeRoot(rootPath));
  ipcMain.handle("index:getStatus", () => searchIndex.getStatus());
  ipcMain.handle("index:getStats", () => searchIndex.getStats());
  ipcMain.handle("index:keywordSearch", (_e, params: KeywordSearchParams) => searchIndex.keywordSearch(params));
  ipcMain.handle("index:metadataSearch", (_e, params: MetadataSearchParams) => searchIndex.metadataSearch(params));
  ipcMain.handle("index:vectorSearch", (_e, params: VectorSearchParams) => searchIndex.vectorSearch(params));
  ipcMain.handle("index:getDirRollup", (_e, dirPath: string) => searchIndex.getDirRollup(dirPath));
  ipcMain.handle("index:listSubdirRollups", (_e, dirPath: string) => searchIndex.listSubdirRollups(dirPath));
  ipcMain.handle("index:getEmbedStatus", () => searchIndex.getEmbedStatus());

  ipcMain.handle("settings:setApiKey", (_e, key: string) => settings.setApiKey(key));
  ipcMain.handle("settings:hasApiKey", () => settings.hasApiKey());
  ipcMain.handle("settings:clearApiKey", () => settings.clearApiKey());

  ipcMain.handle("agent:query", (e, requestId: string, query: string, currentPath: string) => {
    const apiKey = settings.getApiKey();
    if (!apiKey) {
      e.sender.send("agent:step", {
        requestId,
        step: { type: "error", error: "No Anthropic API key configured. Add one in Settings." },
      });
      return;
    }
    activeAgentRuns.add(requestId);
    runAgent(apiKey, query, currentPath, searchIndex, (step) => {
      if (!activeAgentRuns.has(requestId) || e.sender.isDestroyed()) return;
      e.sender.send("agent:step", { requestId, step });
      if (step.type === "done" || step.type === "error") activeAgentRuns.delete(requestId);
    }).catch((err: unknown) => {
      if (!activeAgentRuns.has(requestId) || e.sender.isDestroyed()) return;
      e.sender.send("agent:step", {
        requestId,
        step: { type: "error", error: err instanceof Error ? err.message : String(err) },
      });
      activeAgentRuns.delete(requestId);
    });
  });

  ipcMain.handle("agent:cancel", (_e, requestId: string) => {
    activeAgentRuns.delete(requestId);
  });
}

export function cleanupWatchers(winId: number) {
  const w = watchers.get(winId);
  if (w) {
    w.close();
    watchers.delete(winId);
  }
}
