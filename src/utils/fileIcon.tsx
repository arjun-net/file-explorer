import {
  Folder,
  FileText,
  FileCode2,
  FileImage,
  FileAudio2,
  FileVideo2,
  FileArchive,
  FileSpreadsheet,
  FileJson,
  FileType2,
  File,
  Home,
  Monitor,
  Download,
  Image as ImageIcon,
  Music,
  Video,
  LayoutGrid,
  HardDrive,
  Usb,
  type LucideIcon,
} from "lucide-react";
import type { FileEntry } from "../api";

const CODE_EXT = new Set([
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp",
  "cs", "swift", "kt", "php", "sh", "zsh", "bash", "html", "css", "scss", "sass",
  "vue", "svelte", "sql", "yml", "yaml", "toml", "lua", "r", "m", "pl",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "heic", "ico", "avif", "tiff"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"]);
const VIDEO_EXT = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv"]);
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz", "dmg", "pkg"]);
const SHEET_EXT = new Set(["xlsx", "xls", "csv", "numbers"]);
const DOC_EXT = new Set(["doc", "docx", "pdf", "pages", "rtf", "txt", "md"]);

export function iconForEntry(entry: Pick<FileEntry, "isDirectory" | "extension">): LucideIcon {
  if (entry.isDirectory) return Folder;
  const ext = entry.extension;
  if (ext === "json") return FileJson;
  if (CODE_EXT.has(ext)) return FileCode2;
  if (IMAGE_EXT.has(ext)) return FileImage;
  if (AUDIO_EXT.has(ext)) return FileAudio2;
  if (VIDEO_EXT.has(ext)) return FileVideo2;
  if (ARCHIVE_EXT.has(ext)) return FileArchive;
  if (SHEET_EXT.has(ext)) return FileSpreadsheet;
  if (ext === "pdf") return FileType2;
  if (DOC_EXT.has(ext)) return FileText;
  return File;
}

export function isPreviewableImage(ext: string): boolean {
  return IMAGE_EXT.has(ext) && ext !== "heic";
}

export function isPreviewableText(ext: string): boolean {
  return CODE_EXT.has(ext) || ["txt", "md", "json", "log", "csv", "xml", "env"].includes(ext);
}

const quickAccessIcons: Record<string, LucideIcon> = {
  home: Home,
  monitor: Monitor,
  "file-text": FileText,
  download: Download,
  image: ImageIcon,
  music: Music,
  video: Video,
  "layout-grid": LayoutGrid,
};

export function iconForQuickAccess(iconKey: string): LucideIcon {
  return quickAccessIcons[iconKey] ?? Folder;
}

export function iconForVolume(kind: "volume" | "root"): LucideIcon {
  return kind === "root" ? HardDrive : Usb;
}
