import { useEffect, useState } from "react";
import { Database, Loader2, Search, Sparkles, X } from "lucide-react";
import type { EmbedStatus, IndexedFile, IndexStats, IndexStatus, VectorSearchResult } from "../api";
import { iconForEntry } from "../utils/fileIcon";
import { formatBytes, formatDate } from "../utils/format";

interface SmartSearchPanelProps {
  currentPath: string;
  onNavigateToResult: (path: string, isDirectory: boolean) => void;
}

type Mode = "name" | "content";
type ResultRow = IndexedFile & Partial<Pick<VectorSearchResult, "similarity" | "matchedFrameTime" | "matchedKind">>;

/**
 * The foundation for the "agentic" search experience: index the current
 * folder (SQLite FTS5 for names/metadata, CLIP embeddings for image/video
 * content), then search it instantly. This search box is a stand-in for the
 * eventual LLM agent (which will call the same keyword/metadata/vector/
 * rollup tools this panel already exercises, deciding for itself which to
 * call, rather than the user picking a mode by hand). See ARCHITECTURE.md.
 */
export function SmartSearchPanel({ currentPath, onNavigateToResult }: SmartSearchPanelProps) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus | null>(null);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [mode, setMode] = useState<Mode>("name");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    window.fileAPI.indexGetStatus().then(setStatus);
    window.fileAPI.indexGetEmbedStatus().then(setEmbedStatus);
    window.fileAPI.indexGetStats().then(setStats);
    const unsubIndex = window.fileAPI.onIndexStatusChanged((s) => {
      setStatus(s);
      if (s.state === "done") window.fileAPI.indexGetStats().then(setStats);
    });
    const unsubEmbed = window.fileAPI.onIndexEmbedStatusChanged(setEmbedStatus);
    return () => {
      unsubIndex();
      unsubEmbed();
    };
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
      const request =
        mode === "name"
          ? window.fileAPI.indexKeywordSearch({ query: trimmed, limit: 100 })
          : window.fileAPI.indexVectorSearch({ query: trimmed, limit: 60 });
      request
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
  }, [query, mode]);

  const isIndexed = stats?.indexedRoots.some((root) => currentPath === root || currentPath.startsWith(root + "/"));
  const scanning = status?.state === "scanning";
  const embedding = embedStatus?.state === "embedding";

  return (
    <div className="smart-search-panel">
      <div className="smart-search-header">
        <Database size={16} />
        <div className="smart-search-header-text">
          <div className="smart-search-title">Indexed Search</div>
          <div className="smart-search-subtitle">
            {scanning
              ? `Indexing… ${status?.processed ?? 0} items${status?.currentPath ? ` — ${status.currentPath}` : ""}`
              : embedding
                ? `Analyzing image/video content… ${embedStatus?.processed ?? 0}/${embedStatus?.total ?? 0}`
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
        {(scanning || embedding) && <Loader2 size={15} className="smart-search-spin" />}
      </div>

      <div className="smart-search-mode">
        <button className={mode === "name" ? "active" : ""} onClick={() => setMode("name")}>
          <Search size={13} />
          Name
        </button>
        <button className={mode === "content" ? "active" : ""} onClick={() => setMode("content")}>
          <Sparkles size={13} />
          Content
        </button>
      </div>

      <div className="smart-search-box">
        <Search size={14} />
        <input
          autoFocus
          placeholder={mode === "name" ? "Search indexed files by name…" : "Describe what's in the image or video…"}
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
            {mode === "content"
              ? "Search photos and videos by what's actually in them — e.g. \"dog on a beach\" — not their filenames."
              : stats && stats.indexedRoots.length > 0
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
                  <div className="smart-search-result-path">
                    {entry.parentDir}
                    {entry.matchedKind === "video_frame" && entry.matchedFrameTime != null && (
                      <span className="smart-search-frame-badge">@{Math.round(entry.matchedFrameTime)}s</span>
                    )}
                  </div>
                </div>
                <div className="smart-search-result-meta">
                  {entry.similarity != null ? (
                    <span>{Math.round(entry.similarity * 100)}% match</span>
                  ) : !entry.isDirectory ? (
                    <span>{formatBytes(entry.size)}</span>
                  ) : null}
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
