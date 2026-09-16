import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { FileEntry, VolumeInfo, QuickAccessEntry, SearchResult } from "../shared/types";

const api = {
  listDir: (dirPath: string): Promise<FileEntry[]> => ipcRenderer.invoke("fs:listDir", dirPath),
  stat: (p: string): Promise<FileEntry> => ipcRenderer.invoke("fs:stat", p),
  getHome: (): Promise<string> => ipcRenderer.invoke("fs:getHome"),
  getQuickAccess: (): Promise<QuickAccessEntry[]> => ipcRenderer.invoke("fs:getQuickAccess"),
  getVolumes: (): Promise<VolumeInfo[]> => ipcRenderer.invoke("fs:getVolumes"),

  createFolder: (parentDir: string, baseName?: string): Promise<FileEntry> =>
    ipcRenderer.invoke("fs:createFolder", parentDir, baseName),
  createFile: (parentDir: string, baseName?: string): Promise<FileEntry> =>
    ipcRenderer.invoke("fs:createFile", parentDir, baseName),
  rename: (fullPath: string, newName: string): Promise<FileEntry> =>
    ipcRenderer.invoke("fs:rename", fullPath, newName),
  deleteEntries: (paths: string[]): Promise<void> => ipcRenderer.invoke("fs:delete", paths),
  copyEntries: (srcPaths: string[], destDir: string): Promise<void> =>
    ipcRenderer.invoke("fs:copy", srcPaths, destDir),
  moveEntries: (srcPaths: string[], destDir: string): Promise<void> =>
    ipcRenderer.invoke("fs:move", srcPaths, destDir),
  openPath: (p: string): Promise<void> => ipcRenderer.invoke("fs:openPath", p),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke("fs:showInFolder", p),
  readTextPreview: (p: string): Promise<{ text: string; truncated: boolean; size: number }> =>
    ipcRenderer.invoke("fs:readTextPreview", p),

  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickDirectory"),

  searchStart: (requestId: string, rootPath: string, query: string): Promise<void> =>
    ipcRenderer.invoke("search:start", requestId, rootPath, query),
  searchCancel: (requestId: string): Promise<void> => ipcRenderer.invoke("search:cancel", requestId),
  onSearchResult: (cb: (r: SearchResult) => void) => {
    const listener = (_e: unknown, data: SearchResult) => cb(data);
    ipcRenderer.on("search:result", listener);
    return () => ipcRenderer.removeListener("search:result", listener);
  },
  onSearchDone: (cb: (requestId: string) => void) => {
    const listener = (_e: unknown, data: { requestId: string }) => cb(data.requestId);
    ipcRenderer.on("search:done", listener);
    return () => ipcRenderer.removeListener("search:done", listener);
  },

  watchDir: (dirPath: string): Promise<void> => ipcRenderer.invoke("fs:watch", dirPath),
  unwatchDir: (): Promise<void> => ipcRenderer.invoke("fs:unwatch"),
  onDirChanged: (cb: (p: string) => void) => {
    const listener = (_e: unknown, data: { path: string }) => cb(data.path);
    ipcRenderer.on("fs:changed", listener);
    return () => ipcRenderer.removeListener("fs:changed", listener);
  },

  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  getPathSeparator: (): Promise<string> => ipcRenderer.invoke("app:getPathSeparator"),
};

contextBridge.exposeInMainWorld("fileAPI", api);
contextBridge.exposeInMainWorld("electronPathFor", (file: File) => webUtils.getPathForFile(file));

export type FileAPI = typeof api;
