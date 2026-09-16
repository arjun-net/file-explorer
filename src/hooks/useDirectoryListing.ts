import { useCallback, useEffect, useState } from "react";
import type { FileEntry } from "../api";

export function useDirectoryListing(path: string) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    async function load() {
      try {
        const list = await window.fileAPI.listDir(path);
        if (!cancelled) {
          setEntries(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();
    window.fileAPI.watchDir(path);
    const unsubscribe = window.fileAPI.onDirChanged(() => load());

    return () => {
      cancelled = true;
      unsubscribe();
      window.fileAPI.unwatchDir();
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { entries, loading, error, reload };
}
