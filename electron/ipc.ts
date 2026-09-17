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

const watchers = new Map<number, fssync.FSWatcher>();

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: NodeJS.Timeout | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function registerIpcHandlers() {
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
}

export function cleanupWatchers(winId: number) {
  const w = watchers.get(winId);
  if (w) {
    w.close();
    watchers.delete(winId);
  }
}
