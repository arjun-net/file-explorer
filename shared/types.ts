export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
  extension: string;
  hidden: boolean;
}

export interface VolumeInfo {
  name: string;
  path: string;
  kind: "volume" | "root";
}

export interface QuickAccessEntry {
  name: string;
  path: string;
  icon: string;
}

export interface SearchResult {
  requestId: string;
  entry: FileEntry;
}

export interface OpResult {
  ok: boolean;
  error?: string;
}

export type DirChangeEvent = { path: string };

export interface IndexStatus {
  state: "idle" | "scanning" | "done" | "error";
  rootPath?: string;
  processed: number;
  currentPath?: string;
  error?: string;
}

export interface IndexedFile {
  id: number;
  path: string;
  parentDir: string;
  name: string;
  extension: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ctime: number;
}

export interface DirRollup {
  dirPath: string;
  fileCount: number;
  dirCount: number;
  totalSize: number;
  topExtensions: Record<string, number>;
  maxMtime: number;
  updatedAt: number;
}

export interface KeywordSearchParams {
  query: string;
  rootPath?: string;
  limit?: number;
}

export interface MetadataSearchParams {
  rootPath?: string;
  extensions?: string[];
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: number;
  modifiedBefore?: number;
  isDirectory?: boolean;
  limit?: number;
}

export interface IndexStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  indexedRoots: string[];
}

export interface VectorSearchParams {
  query: string;
  rootPath?: string;
  limit?: number;
}

export interface VectorSearchResult extends IndexedFile {
  similarity: number;
  matchedKind: "image" | "video_frame";
  matchedFrameTime: number | null;
}

export interface EmbedStatus {
  state: "idle" | "embedding" | "done" | "error";
  rootPath?: string;
  processed: number;
  total: number;
  currentPath?: string;
  error?: string;
}

export interface AgentStep {
  type: "tool_call" | "tool_result" | "text" | "done" | "error";
  tool?: string;
  input?: Record<string, unknown>;
  preview?: string;
  text?: string;
  summary?: string;
  files?: { path: string; reason: string }[];
  error?: string;
}

export interface AgentStepEvent {
  requestId: string;
  step: AgentStep;
}
