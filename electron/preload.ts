import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  FileEntry,
  VolumeInfo,
  QuickAccessEntry,
  SearchResult,
  IndexStatus,
  EmbedStatus,
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  VectorSearchParams,
  VectorSearchResult,
  IndexStats,
  AgentStepEvent,
} from "../shared/types";

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

  indexAddRoot: (rootPath: string): Promise<void> => ipcRenderer.invoke("index:addRoot", rootPath),
  indexRemoveRoot: (rootPath: string): Promise<void> => ipcRenderer.invoke("index:removeRoot", rootPath),
  indexGetStatus: (): Promise<IndexStatus> => ipcRenderer.invoke("index:getStatus"),
  indexGetStats: (): Promise<IndexStats> => ipcRenderer.invoke("index:getStats"),
  indexKeywordSearch: (params: KeywordSearchParams): Promise<IndexedFile[]> =>
    ipcRenderer.invoke("index:keywordSearch", params),
  indexMetadataSearch: (params: MetadataSearchParams): Promise<IndexedFile[]> =>
    ipcRenderer.invoke("index:metadataSearch", params),
  indexVectorSearch: (params: VectorSearchParams): Promise<VectorSearchResult[]> =>
    ipcRenderer.invoke("index:vectorSearch", params),
  indexGetDirRollup: (dirPath: string): Promise<DirRollup | null> =>
    ipcRenderer.invoke("index:getDirRollup", dirPath),
  indexListSubdirRollups: (dirPath: string): Promise<DirRollup[]> =>
    ipcRenderer.invoke("index:listSubdirRollups", dirPath),
  indexGetEmbedStatus: (): Promise<EmbedStatus> => ipcRenderer.invoke("index:getEmbedStatus"),
  onIndexStatusChanged: (cb: (status: IndexStatus) => void) => {
    const listener = (_e: unknown, data: IndexStatus) => cb(data);
    ipcRenderer.on("index:statusChanged", listener);
    return () => ipcRenderer.removeListener("index:statusChanged", listener);
  },
  onIndexEmbedStatusChanged: (cb: (status: EmbedStatus) => void) => {
    const listener = (_e: unknown, data: EmbedStatus) => cb(data);
    ipcRenderer.on("index:embedStatusChanged", listener);
    return () => ipcRenderer.removeListener("index:embedStatusChanged", listener);
  },

  settingsSetApiKey: (key: string): Promise<void> => ipcRenderer.invoke("settings:setApiKey", key),
  settingsHasApiKey: (): Promise<boolean> => ipcRenderer.invoke("settings:hasApiKey"),
  settingsClearApiKey: (): Promise<void> => ipcRenderer.invoke("settings:clearApiKey"),

  agentQuery: (requestId: string, query: string, currentPath: string): Promise<void> =>
    ipcRenderer.invoke("agent:query", requestId, query, currentPath),
  agentCancel: (requestId: string): Promise<void> => ipcRenderer.invoke("agent:cancel", requestId),
  onAgentStep: (cb: (event: AgentStepEvent) => void) => {
    const listener = (_e: unknown, data: AgentStepEvent) => cb(data);
    ipcRenderer.on("agent:step", listener);
    return () => ipcRenderer.removeListener("agent:step", listener);
  },
};

contextBridge.exposeInMainWorld("fileAPI", api);
contextBridge.exposeInMainWorld("electronPathFor", (file: File) => webUtils.getPathForFile(file));

export type FileAPI = typeof api;
