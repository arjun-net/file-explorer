import { useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Folder,
  FolderTree,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { AgentStep, EmbedStatus, IndexedFile, IndexStats, IndexStatus, VectorSearchResult } from "../api";
import { iconForEntry } from "../utils/fileIcon";
import { formatBytes, formatDate } from "../utils/format";

interface SmartSearchPanelProps {
  currentPath: string;
  onNavigateToResult: (path: string, isDirectory: boolean) => void;
}

type Mode = "name" | "content" | "ask";
type ResultRow = IndexedFile & Partial<Pick<VectorSearchResult, "similarity" | "matchedFrameTime" | "matchedKind">>;

const TOOL_META: Record<string, { label: string; icon: typeof Search }> = {
  keyword_search: { label: "Searching by name", icon: Search },
  content_search: { label: "Searching by content", icon: Sparkles },
  metadata_search: { label: "Filtering by size/type/date", icon: SlidersHorizontal },
  list_subdir_rollups: { label: "Checking subfolders", icon: FolderTree },
  get_dir_rollup: { label: "Checking folder", icon: Folder },
  index_status: { label: "Checking the index", icon: Database },
};

function toolFocus(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  return (input.query as string) ?? (input.dirPath as string) ?? "";
}

type AskEntry =
  | { kind: "turn"; tool: string; input: Record<string, unknown>; preview?: string; pending: boolean }
  | { kind: "text"; text: string };

function buildAskEntries(steps: AgentStep[]): AskEntry[] {
  const entries: AskEntry[] = [];
  for (const step of steps) {
    if (step.type === "tool_call") {
      entries.push({ kind: "turn", tool: step.tool ?? "", input: step.input ?? {}, pending: true });
    } else if (step.type === "tool_result") {
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.kind === "turn" && e.pending) {
          e.preview = step.preview;
          e.pending = false;
          break;
        }
      }
    } else if (step.type === "text" && step.text?.trim()) {
      entries.push({ kind: "text", text: step.text });
    }
  }
  return entries;
}

function AskTurnView({ entry }: { entry: Extract<AskEntry, { kind: "turn" }> }) {
  const meta = TOOL_META[entry.tool];
  const Icon = meta?.icon ?? Sparkles;
  const focus = toolFocus(entry.input);
  return (
    <div className="ask-turn">
      <div className={`ask-turn-icon${entry.pending ? " ask-turn-icon-pending" : ""}`}>
        <Icon size={13} />
      </div>
      <div className="ask-turn-text">
        <div className="ask-turn-label">
          {meta?.label ?? entry.tool}
          {focus && <span className="ask-turn-focus">"{focus}"</span>}
        </div>
        {entry.preview && <div className="ask-turn-preview">{entry.preview}</div>}
      </div>
    </div>
  );
}

function ResultRowView({ entry, onClick }: { entry: ResultRow; onClick: () => void }) {
  const Icon = iconForEntry({ isDirectory: entry.isDirectory, extension: entry.extension });
  return (
    <button className="smart-search-result" onClick={onClick}>
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
}

/**
 * Indexed search, in three modes:
 *  - Name / Content: direct manual access to keyword and CLIP vector search.
 *  - Ask: the actual agent — a natural-language query drives an LLM
 *    tool-calling loop over the same keyword/content/metadata/rollup tools,
 *    deciding for itself how to search. See ARCHITECTURE.md.
 */
export function SmartSearchPanel({ currentPath, onNavigateToResult }: SmartSearchPanelProps) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus | null>(null);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [mode, setMode] = useState<Mode>("ask");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);

  const [askInput, setAskInput] = useState("");
  const [askSteps, setAskSteps] = useState<AgentStep[]>([]);
  const [askRunning, setAskRunning] = useState(false);
  const askRequestId = useRef<string | null>(null);

  useEffect(() => {
    window.fileAPI.indexGetStatus().then(setStatus);
    window.fileAPI.indexGetEmbedStatus().then(setEmbedStatus);
    window.fileAPI.indexGetStats().then(setStats);
    const unsubIndex = window.fileAPI.onIndexStatusChanged((s) => {
      setStatus(s);
      if (s.state === "done") window.fileAPI.indexGetStats().then(setStats);
    });
    const unsubEmbed = window.fileAPI.onIndexEmbedStatusChanged(setEmbedStatus);
    const unsubAgent = window.fileAPI.onAgentStep(({ requestId, step }) => {
      if (requestId !== askRequestId.current) return;
      setAskSteps((prev) => [...prev, step]);
      if (step.type === "done" || step.type === "error") setAskRunning(false);
    });
    return () => {
      unsubIndex();
      unsubEmbed();
      unsubAgent();
    };
  }, []);

  useEffect(() => {
    if (mode === "ask") return;
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

  function submitAsk() {
    const trimmed = askInput.trim();
    if (!trimmed || askRunning) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    askRequestId.current = id;
    setAskSteps([]);
    setAskRunning(true);
    window.fileAPI.agentQuery(id, trimmed, currentPath);
  }

  const isIndexed = stats?.indexedRoots.some((root) => currentPath === root || currentPath.startsWith(root + "/"));
  const scanning = status?.state === "scanning";
  const embedding = embedStatus?.state === "embedding";
  const doneStep = askSteps.find((s) => s.type === "done");
  const errorStep = askSteps.find((s) => s.type === "error");
  const askEntries = useMemo(() => buildAskEntries(askSteps), [askSteps]);

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
                  ? `${stats.totalFiles.toLocaleString()} files indexed across ${stats.indexedRoots.length} location${stats.indexedRoots.length === 1 ? "" : "s"} · ${formatBytes(stats.totalSize)} of files`
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
        <button className={mode === "ask" ? "active" : ""} onClick={() => setMode("ask")}>
          <Wand2 size={13} />
          Ask
        </button>
        <button className={mode === "name" ? "active" : ""} onClick={() => setMode("name")}>
          <Search size={13} />
          Name
        </button>
        <button className={mode === "content" ? "active" : ""} onClick={() => setMode("content")}>
          <Sparkles size={13} />
          Content
        </button>
      </div>

      {mode === "ask" ? (
        <>
          <div className="smart-search-box">
            <Wand2 size={14} />
            <input
              autoFocus
              placeholder="Describe what you're looking for…"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAsk()}
              disabled={askRunning}
            />
            {askInput && !askRunning && (
              <button onClick={() => setAskInput("")}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="smart-search-results">
            {askSteps.length === 0 ? (
              <div className="smart-search-empty">
                {!isIndexed && !scanning ? (
                  <>
                    <p>
                      This folder isn't indexed yet, so there's nothing for the agent to search. Index it first (a
                      few seconds for most folders).
                    </p>
                    <button
                      className="smart-search-index-btn"
                      onClick={() => window.fileAPI.indexAddRoot(currentPath)}
                    >
                      Index This Folder
                    </button>
                  </>
                ) : (
                  "Describe what you're looking for in plain language — the agent decides how to search (by name, by content, by folder) on its own."
                )}
              </div>
            ) : (
              <div className="ask-transcript">
                {askEntries.map((entry, i) =>
                  entry.kind === "text" ? (
                    <div key={i} className="ask-text">
                      {entry.text}
                    </div>
                  ) : (
                    <AskTurnView key={i} entry={entry} />
                  )
                )}

                {errorStep && (
                  <div className="ask-turn ask-turn-error">
                    <div className="ask-turn-icon ask-turn-icon-error">
                      <X size={13} />
                    </div>
                    <div className="ask-turn-text">
                      <div className="ask-turn-label">
                        {errorStep.error?.includes("API key") ? "No API key configured" : "Something went wrong"}
                      </div>
                      <div className="ask-turn-preview">
                        {errorStep.error?.includes("API key")
                          ? "Open Settings (gear icon in the toolbar) to add an Anthropic API key."
                          : errorStep.error}
                      </div>
                    </div>
                  </div>
                )}

                {askRunning && (
                  <div className="ask-thinking">
                    <span className="ask-thinking-dot" />
                    <span className="ask-thinking-dot" />
                    <span className="ask-thinking-dot" />
                  </div>
                )}

                {doneStep && <div className="ask-summary">{doneStep.summary}</div>}
                {doneStep?.files?.map((f) => (
                  <button
                    key={f.path}
                    className="smart-search-result ask-file-result"
                    onClick={() => onNavigateToResult(f.path, false)}
                  >
                    {(() => {
                      const ext = f.path.split(".").pop() ?? "";
                      const Icon = iconForEntry({ isDirectory: false, extension: ext });
                      return <Icon size={17} strokeWidth={1.5} />;
                    })()}
                    <div className="smart-search-result-text">
                      <div className="smart-search-result-name">{f.path.split("/").pop()}</div>
                      <div className="smart-search-result-path">{f.reason}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
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
              results.map((entry) => (
                <ResultRowView key={entry.id} entry={entry} onClick={() => onNavigateToResult(entry.path, entry.isDirectory)} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
