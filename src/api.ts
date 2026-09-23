import type {
  FileEntry,
  VolumeInfo,
  QuickAccessEntry,
  SearchResult,
  IndexStatus,
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  IndexStats,
} from "../shared/types";

export type {
  FileEntry,
  VolumeInfo,
  QuickAccessEntry,
  SearchResult,
  IndexStatus,
  IndexedFile,
  DirRollup,
  KeywordSearchParams,
  MetadataSearchParams,
  IndexStats,
};

export interface FileAPI {
  listDir(dirPath: string): Promise<FileEntry[]>;
  stat(p: string): Promise<FileEntry>;
  getHome(): Promise<string>;
  getQuickAccess(): Promise<QuickAccessEntry[]>;
  getVolumes(): Promise<VolumeInfo[]>;

  createFolder(parentDir: string, baseName?: string): Promise<FileEntry>;
  createFile(parentDir: string, baseName?: string): Promise<FileEntry>;
  rename(fullPath: string, newName: string): Promise<FileEntry>;
  deleteEntries(paths: string[]): Promise<void>;
  copyEntries(srcPaths: string[], destDir: string): Promise<void>;
  moveEntries(srcPaths: string[], destDir: string): Promise<void>;
  openPath(p: string): Promise<void>;
  showInFolder(p: string): Promise<void>;
  readTextPreview(p: string): Promise<{ text: string; truncated: boolean; size: number }>;

  pickDirectory(): Promise<string | null>;

  searchStart(requestId: string, rootPath: string, query: string): Promise<void>;
  searchCancel(requestId: string): Promise<void>;
  onSearchResult(cb: (r: SearchResult) => void): () => void;
  onSearchDone(cb: (requestId: string) => void): () => void;

  watchDir(dirPath: string): Promise<void>;
  unwatchDir(): Promise<void>;
  onDirChanged(cb: (p: string) => void): () => void;

  getVersion(): Promise<string>;
  getPathSeparator(): Promise<string>;

  indexAddRoot(rootPath: string): Promise<void>;
  indexRemoveRoot(rootPath: string): Promise<void>;
  indexGetStatus(): Promise<IndexStatus>;
  indexGetStats(): Promise<IndexStats>;
  indexKeywordSearch(params: KeywordSearchParams): Promise<IndexedFile[]>;
  indexMetadataSearch(params: MetadataSearchParams): Promise<IndexedFile[]>;
  indexGetDirRollup(dirPath: string): Promise<DirRollup | null>;
  indexListSubdirRollups(dirPath: string): Promise<DirRollup[]>;
  onIndexStatusChanged(cb: (status: IndexStatus) => void): () => void;
}

declare global {
  interface Window {
    fileAPI: FileAPI;
    electronPathFor: (file: File) => string;
  }
}
