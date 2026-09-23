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
  AgentStep,
  AgentStepEvent,
} from "../shared/types";

export type {
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
  AgentStep,
  AgentStepEvent,
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
  indexVectorSearch(params: VectorSearchParams): Promise<VectorSearchResult[]>;
  indexGetDirRollup(dirPath: string): Promise<DirRollup | null>;
  indexListSubdirRollups(dirPath: string): Promise<DirRollup[]>;
  indexGetEmbedStatus(): Promise<EmbedStatus>;
  onIndexStatusChanged(cb: (status: IndexStatus) => void): () => void;
  onIndexEmbedStatusChanged(cb: (status: EmbedStatus) => void): () => void;

  settingsSetApiKey(key: string): Promise<void>;
  settingsHasApiKey(): Promise<boolean>;
  settingsClearApiKey(): Promise<void>;

  agentQuery(requestId: string, query: string, currentPath: string): Promise<void>;
  agentCancel(requestId: string): Promise<void>;
  onAgentStep(cb: (event: AgentStepEvent) => void): () => void;
}

declare global {
  interface Window {
    fileAPI: FileAPI;
    electronPathFor: (file: File) => string;
  }
}
