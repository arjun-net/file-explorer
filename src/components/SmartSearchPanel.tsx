import { useEffect, useState } from "react";
import { Database, Loader2, Search, X } from "lucide-react";
import type { IndexedFile, IndexStats, IndexStatus } from "../api";
import { iconForEntry } from "../utils/fileIcon";
import { formatBytes, formatDate } from "../utils/format";

interface SmartSearchPanelProps {
  currentPath: string;
  onNavigateToResult: (path: string, isDirectory: boolean) => void;
}

/**
 * The foundation for the "agentic" search experience: index the current
 * folder into SQLite FTS5, then search it instantly. This keyword search box
 * is a stand-in for the eventual LLM agent (which will call the same
 * keyword/metadata/rollup tools this panel already exercises, deciding for
 * itself which to call and how to navigate the tree, rather than the user
 * typing one query directly). See ARCHITECTURE.md.
 */
export function SmartSearchPanel({ currentPath, onNavigateToResult }: SmartSearchPanelProps) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndexedFile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    window.fileAPI.indexGetStatus().then(setStatus);
    window.fileAPI.indexGetStats().then(setStats);
    const unsub = window.fileAPI.onIndexStatusChanged((s) => {
      setStatus(s);
      if (s.state === "done") window.fileAPI.indexGetStats().then(setStats);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      window.fileAPI
        .indexKeywordSearch({ query: trimmed, limit: 100 })
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const isIndexed = stats?.indexedRoots.some((root) => currentPath === root || currentPath.startsWith(root + "/"));
  const scanning = status?.state === "scanning";

  return (
    <div className="smart-search-panel">
      <div className="smart-search-header">
        <Database size={16} />
        <div className="smart-search-header-text">
          <div className="smart-search-title">Indexed Search</div>
          <div className="smart-search-subtitle">
            {scanning
              ? `Indexing… ${status?.processed ?? 0} items${status?.currentPath ? ` — ${status.currentPath}` : ""}`
              : stats && stats.indexedRoots.length > 0
                ? `${stats.totalFiles.toLocaleString()} files indexed across ${stats.indexedRoots.length} location${stats.indexedRoots.length === 1 ? "" : "s"} (${formatBytes(stats.totalSize)})`
                : "Nothing indexed yet"}
          </div>
        </div>
        {!isIndexed && !scanning && (
          <button className="smart-search-index-btn" onClick={() => window.fileAPI.indexAddRoot(currentPath)}>
            Index This Folder
          </button>
        )}
        {scanning && <Loader2 size={15} className="smart-search-spin" />}
      </div>

      <div className="smart-search-box">
        <Search size={14} />
        <input
          autoFocus
          placeholder="Search indexed files by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>

      <div className="smart-search-results">
        {!query.trim() ? (
          <div className="smart-search-empty">
            {stats && stats.indexedRoots.length > 0
              ? "Type to search everything that's been indexed."
              : "Index a folder above, then search it instantly — including subfolders you haven't opened yet."}
          </div>
        ) : searching ? (
          <div className="smart-search-empty">Searching…</div>
        ) : results.length === 0 ? (
          <div className="smart-search-empty">No matches for "{query}".</div>
        ) : (
          results.map((entry) => {
            const Icon = iconForEntry({ isDirectory: entry.isDirectory, extension: entry.extension });
            return (
              <button
                key={entry.id}
                className="smart-search-result"
                onClick={() => onNavigateToResult(entry.path, entry.isDirectory)}
              >
                <Icon size={17} strokeWidth={1.5} />
                <div className="smart-search-result-text">
                  <div className="smart-search-result-name">{entry.name}</div>
                  <div className="smart-search-result-path">{entry.parentDir}</div>
                </div>
                <div className="smart-search-result-meta">
                  {!entry.isDirectory && <span>{formatBytes(entry.size)}</span>}
                  <span>{formatDate(entry.mtime)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
