export type ViewMode = "list" | "grid";
export type SortKey = "name" | "size" | "modified" | "kind";
export type SortDir = "asc" | "desc";

export interface ClipboardState {
  paths: string[];
  mode: "copy" | "cut";
}

export interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string | null;
}
