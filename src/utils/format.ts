export function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? bytes : value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const todayFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Today, ${todayFormatter.format(date)}`;
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

export function joinPath(dir: string, name: string, sep: string): string {
  if (dir.endsWith(sep)) return `${dir}${name}`;
  return `${dir}${sep}${name}`;
}

export function dirname(p: string, sep: string): string {
  const trimmed = p.endsWith(sep) && p.length > 1 ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf(sep);
  if (idx <= 0) return sep;
  return trimmed.slice(0, idx);
}

export function basename(p: string, sep: string): string {
  const trimmed = p.endsWith(sep) && p.length > 1 ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf(sep);
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function kindLabel(entry: { isDirectory: boolean; extension: string }): string {
  if (entry.isDirectory) return "Folder";
  if (!entry.extension) return "Document";
  return `${entry.extension.toUpperCase()} File`;
}
