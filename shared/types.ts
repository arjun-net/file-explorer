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
