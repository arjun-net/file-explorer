import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import type { FileEntry, VolumeInfo, QuickAccessEntry } from "../shared/types";

export async function statToEntry(fullPath: string): Promise<FileEntry> {
  const lst = await fs.lstat(fullPath);
  const isSymlink = lst.isSymbolicLink();
  let st = lst;
  if (isSymlink) {
    try {
      st = await fs.stat(fullPath);
    } catch {
      st = lst;
    }
  }
  const name = path.basename(fullPath);
  return {
    name,
    path: fullPath,
    isDirectory: st.isDirectory(),
    isSymlink,
    size: st.size,
    mtimeMs: st.mtimeMs,
    birthtimeMs: st.birthtimeMs,
    extension: st.isDirectory() ? "" : path.extname(name).replace(/^\./, "").toLowerCase(),
    hidden: name.startsWith("."),
  };
}

export async function listDir(dirPath: string): Promise<FileEntry[]> {
  const names = await fs.readdir(dirPath);
  const entries: FileEntry[] = [];
  await Promise.all(
    names.map(async (name) => {
      try {
        entries.push(await statToEntry(path.join(dirPath, name)));
      } catch {
        // Skip entries that vanish or are inaccessible mid-read.
      }
    })
  );
  return entries;
}

export function getHome(): string {
  return os.homedir();
}

export function getQuickAccess(): QuickAccessEntry[] {
  const home = os.homedir();
  const candidates: QuickAccessEntry[] = [
    { name: "Home", path: home, icon: "home" },
    { name: "Desktop", path: path.join(home, "Desktop"), icon: "monitor" },
    { name: "Documents", path: path.join(home, "Documents"), icon: "file-text" },
    { name: "Downloads", path: path.join(home, "Downloads"), icon: "download" },
    { name: "Pictures", path: path.join(home, "Pictures"), icon: "image" },
    { name: "Music", path: path.join(home, "Music"), icon: "music" },
    { name: "Movies", path: path.join(home, "Movies"), icon: "video" },
  ];
  if (process.platform === "darwin") {
    candidates.push({ name: "Applications", path: "/Applications", icon: "layout-grid" });
  }
  return candidates.filter((c) => fssync.existsSync(c.path));
}

export function getVolumes(): VolumeInfo[] {
  const volumes: VolumeInfo[] = [];
  if (process.platform === "win32") {
    for (let code = 65; code <= 90; code++) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (fssync.existsSync(drive)) {
        volumes.push({ name: drive, path: drive, kind: "root" });
      }
    }
    return volumes;
  }

  volumes.push({ name: process.platform === "darwin" ? "Macintosh HD" : "Filesystem", path: "/", kind: "root" });

  if (process.platform === "darwin" && fssync.existsSync("/Volumes")) {
    try {
      const names = fssync.readdirSync("/Volumes");
      for (const name of names) {
        const volPath = path.join("/Volumes", name);
        try {
          const st = fssync.lstatSync(volPath);
          if (st.isDirectory() || st.isSymbolicLink()) {
            const real = fssync.realpathSync(volPath);
            if (real === "/") continue;
            volumes.push({ name, path: volPath, kind: "volume" });
          }
        } catch {
          // Ignore volumes we can't stat (permissions, disconnected network shares).
        }
      }
    } catch {
      // /Volumes unreadable; fall back to root only.
    }
  }
  return volumes;
}

async function uniqueDestPath(destDir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(destDir, name);
  let n = 2;
  while (fssync.existsSync(candidate)) {
    candidate = path.join(destDir, `${base} ${n}${ext}`);
    n++;
  }
  return candidate;
}

export async function createFolder(parentDir: string, baseName = "untitled folder"): Promise<FileEntry> {
  const target = await uniqueDestPath(parentDir, baseName);
  await fs.mkdir(target);
  return statToEntry(target);
}

export async function createFile(parentDir: string, baseName = "untitled.txt"): Promise<FileEntry> {
  const target = await uniqueDestPath(parentDir, baseName);
  await fs.writeFile(target, "");
  return statToEntry(target);
}

export async function renameEntry(fullPath: string, newName: string): Promise<FileEntry> {
  const dest = path.join(path.dirname(fullPath), newName);
  if (dest !== fullPath && fssync.existsSync(dest)) {
    throw new Error(`"${newName}" already exists.`);
  }
  await fs.rename(fullPath, dest);
  return statToEntry(dest);
}

async function copyRecursive(src: string, dest: string) {
  await fs.cp(src, dest, { recursive: true, errorOnExist: true, force: false });
}

export async function copyEntries(srcPaths: string[], destDir: string): Promise<void> {
  for (const src of srcPaths) {
    const dest = await uniqueDestPath(destDir, path.basename(src));
    await copyRecursive(src, dest);
  }
}

export async function moveEntries(srcPaths: string[], destDir: string): Promise<void> {
  for (const src of srcPaths) {
    if (path.dirname(src) === destDir) continue;
    const dest = await uniqueDestPath(destDir, path.basename(src));
    try {
      await fs.rename(src, dest);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        await copyRecursive(src, dest);
        await fs.rm(src, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "Zero KB";
  const units = ["bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? bytes : value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}
