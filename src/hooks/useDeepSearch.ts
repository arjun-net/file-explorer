import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry } from "../api";

export function useDeepSearch() {
  const [results, setResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubResult = window.fileAPI.onSearchResult(({ requestId, entry }) => {
      if (requestId !== requestIdRef.current) return;
      setResults((prev) => [...prev, entry]);
    });
    const unsubDone = window.fileAPI.onSearchDone((requestId) => {
      if (requestId !== requestIdRef.current) return;
      setSearching(false);
    });
    return () => {
      unsubResult();
      unsubDone();
    };
  }, []);

  const start = useCallback((rootPath: string, query: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (requestIdRef.current) window.fileAPI.searchCancel(requestIdRef.current);
    requestIdRef.current = id;
    setResults([]);
    setSearching(true);
    window.fileAPI.searchStart(id, rootPath, query);
  }, []);

  const stop = useCallback(() => {
    if (requestIdRef.current) {
      window.fileAPI.searchCancel(requestIdRef.current);
      requestIdRef.current = null;
    }
    setSearching(false);
    setResults([]);
  }, []);

  const removePaths = useCallback((paths: string[]) => {
    const set = new Set(paths);
    setResults((prev) => prev.filter((e) => !set.has(e.path)));
  }, []);

  const replaceEntry = useCallback((oldPath: string, next: FileEntry) => {
    setResults((prev) => prev.map((e) => (e.path === oldPath ? next : e)));
  }, []);

  return { results, searching, start, stop, removePaths, replaceEntry };
}
