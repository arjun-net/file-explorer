import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { FileView } from "./components/FileView";
import { PreviewPanel } from "./components/PreviewPanel";
import { StatusBar } from "./components/StatusBar";
import { ContextMenu, MenuIcons, type MenuAction } from "./components/ContextMenu";
import { useHistory } from "./hooks/useHistory";
import { useDirectoryListing } from "./hooks/useDirectoryListing";
import { useDeepSearch } from "./hooks/useDeepSearch";
import { usePersistentState } from "./utils/persist";
import { dirname, kindLabel } from "./utils/format";
import type { FileEntry, QuickAccessEntry, VolumeInfo } from "./api";
import type { ClipboardState, ContextMenuState, SortDir, SortKey, ViewMode } from "./types";

function compareEntries(a: FileEntry, b: FileEntry, key: SortKey, dir: SortDir): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  let cmp = 0;
  switch (key) {
    case "name":
      cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      break;
    case "size":
      cmp = a.size - b.size;
      break;
    case "modified":
      cmp = a.mtimeMs - b.mtimeMs;
      break;
    case "kind":
      cmp = kindLabel(a).localeCompare(kindLabel(b));
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

export default function App() {
  const [sep, setSep] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [quickAccess, setQuickAccess] = useState<QuickAccessEntry[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);

  const history = useHistory("", sep ?? "/");
  const dirListing = useDirectoryListing(history.currentPath);
  const deepSearch = useDeepSearch();

  const [theme, setTheme] = usePersistentState<"light" | "dark">(
    "files.theme",
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [viewMode, setViewMode] = usePersistentState<ViewMode>("files.viewMode", "list");
  const [sortKey, setSortKey] = usePersistentState<SortKey>("files.sortKey", "name");
  const [sortDir, setSortDir] = usePersistentState<SortDir>("files.sortDir", "asc");
  const [showHidden, setShowHidden] = usePersistentState<boolean>("files.showHidden", false);
  const [previewVisible, setPreviewVisible] = usePersistentState<boolean>("files.previewVisible", true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [sidebarDropTarget, setSidebarDropTarget] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOriginRef = useRef<string>("");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const [home, qa, vols, pathSep] = await Promise.all([
        window.fileAPI.getHome(),
        window.fileAPI.getQuickAccess(),
        window.fileAPI.getVolumes(),
        window.fileAPI.getPathSeparator(),
      ]);
      setSep(pathSep);
      setQuickAccess(qa);
      setVolumes(vols);
      history.initialize(home);
      setReady(true);
    })();
    // Bootstrap runs once; `history` identity is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  const exitSearch = useCallback(() => {
    setSearchMode(false);
    setSearchQuery("");
    deepSearch.stop();
  }, [deepSearch]);

  useEffect(() => {
    setSelected(new Set());
    setLastSelectedIndex(null);
    if (searchMode) exitSearch();
    // Leaving search / clearing selection whenever the browsed folder changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.currentPath]);

  const displayedEntries = useMemo(() => {
    const base = searchMode ? deepSearch.results : dirListing.entries;
    let list = showHidden ? base : base.filter((e) => !e.hidden);
    if (!searchMode && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => compareEntries(a, b, sortKey, sortDir));
  }, [searchMode, deepSearch.results, dirListing.entries, showHidden, searchQuery, sortKey, sortDir]);

  const subtitleFor = useCallback(
    (entry: FileEntry) => (searchMode && sep ? dirname(entry.path, sep) : undefined),
    [searchMode, sep]
  );

  const selectedEntries = useMemo(
    () => displayedEntries.filter((e) => selected.has(e.path)),
    [displayedEntries, selected]
  );
  const selectedSize = useMemo(() => selectedEntries.reduce((sum, e) => sum + e.size, 0), [selectedEntries]);
  const previewEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const cutPaths = useMemo(
    () => new Set(clipboard?.mode === "cut" ? clipboard.paths : []),
    [clipboard]
  );

  const reloadAll = useCallback(() => {
    dirListing.reload();
  }, [dirListing]);

  const doCreateFolder = useCallback(async () => {
    try {
      const created = await window.fileAPI.createFolder(history.currentPath);
      reloadAll();
      setSelected(new Set([created.path]));
      setRenamingPath(created.path);
    } catch (e) {
      showError(e);
    }
  }, [history.currentPath, reloadAll, showError]);

  const doCreateFile = useCallback(async () => {
    try {
      const created = await window.fileAPI.createFile(history.currentPath);
      reloadAll();
      setSelected(new Set([created.path]));
      setRenamingPath(created.path);
    } catch (e) {
      showError(e);
    }
  }, [history.currentPath, reloadAll, showError]);

  const doDelete = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        await window.fileAPI.deleteEntries(paths);
        setSelected(new Set());
        if (searchMode) deepSearch.removePaths(paths);
        reloadAll();
      } catch (e) {
        showError(e);
      }
    },
    [reloadAll, searchMode, deepSearch, showError]
  );

  const doPaste = useCallback(async () => {
    if (!clipboard || clipboard.paths.length === 0) return;
    const destDir = history.currentPath;
    try {
      if (clipboard.mode === "copy") {
        await window.fileAPI.copyEntries(clipboard.paths, destDir);
      } else {
        await window.fileAPI.moveEntries(clipboard.paths, destDir);
        if (searchMode) deepSearch.removePaths(clipboard.paths);
        setClipboard(null);
      }
      reloadAll();
    } catch (e) {
      showError(e);
    }
  }, [clipboard, history.currentPath, reloadAll, searchMode, deepSearch, showError]);

  const doRename = useCallback(
    async (entry: FileEntry, newName: string) => {
      try {
        const updated = await window.fileAPI.rename(entry.path, newName);
        setRenamingPath(null);
        setSelected(new Set([updated.path]));
        if (searchMode) deepSearch.replaceEntry(entry.path, updated);
        reloadAll();
      } catch (e) {
        setRenamingPath(null);
        showError(e);
      }
    },
    [reloadAll, searchMode, deepSearch, showError]
  );

  const moveInto = useCallback(
    async (destDir: string, paths: string[]) => {
      if (paths.includes(destDir)) return;
      try {
        await window.fileAPI.moveEntries(paths, destDir);
        if (searchMode) deepSearch.removePaths(paths);
        reloadAll();
      } catch (e) {
        showError(e);
      }
    },
    [reloadAll, searchMode, deepSearch, showError]
  );

  const handleExternalDrop = useCallback(
    async (paths: string[]) => {
      try {
        await window.fileAPI.copyEntries(paths, history.currentPath);
        reloadAll();
      } catch (e) {
        showError(e);
      }
    },
    [history.currentPath, reloadAll, showError]
  );

  const onOpen = useCallback(
    (entry: FileEntry) => {
      if (entry.isDirectory) {
        if (searchMode) exitSearch();
        history.navigate(entry.path);
      } else {
        window.fileAPI.openPath(entry.path).catch(showError);
      }
    },
    [searchMode, exitSearch, history, showError]
  );

  const onItemMouseDown = useCallback(
    (entry: FileEntry, index: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setContextMenu(null);
      if (e.shiftKey && lastSelectedIndex !== null) {
        const lo = Math.min(lastSelectedIndex, index);
        const hi = Math.max(lastSelectedIndex, index);
        setSelected(new Set(displayedEntries.slice(lo, hi + 1).map((en) => en.path)));
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        setLastSelectedIndex(index);
        return;
      }
      if (!selected.has(entry.path)) {
        setSelected(new Set([entry.path]));
      }
      setLastSelectedIndex(index);
    },
    [displayedEntries, lastSelectedIndex, selected]
  );

  const onItemClick = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (selected.size > 1 && selected.has(entry.path)) {
        setSelected(new Set([entry.path]));
      }
    },
    [selected]
  );

  const onItemContextMenu = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      e.preventDefault();
      if (!selected.has(entry.path)) {
        setSelected(new Set([entry.path]));
      }
      setContextMenu({ x: e.clientX, y: e.clientY, targetPath: entry.path });
    },
    [selected]
  );

  const onBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setSelected(new Set());
    setLastSelectedIndex(null);
    setContextMenu(null);
  }, []);

  const onBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSelected(new Set());
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath: null });
  }, []);

  const onDragStartEntry = useCallback(
    (entry: FileEntry, e: React.DragEvent) => {
      const paths = selected.has(entry.path) && selected.size > 1 ? Array.from(selected) : [entry.path];
      if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
      e.dataTransfer.setData("application/x-file-paths", JSON.stringify(paths));
      e.dataTransfer.effectAllowed = "move";
    },
    [selected]
  );

  const onDragOverEntry = useCallback((entry: FileEntry, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetPath(entry.path);
  }, []);

  const onDragLeaveEntry = useCallback(() => setDropTargetPath(null), []);

  const onDropEntry = useCallback(
    (entry: FileEntry, e: React.DragEvent) => {
      e.preventDefault();
      setDropTargetPath(null);
      if (!entry.isDirectory) return;
      const raw = e.dataTransfer.getData("application/x-file-paths");
      if (!raw) return;
      const paths: string[] = JSON.parse(raw);
      moveInto(entry.path, paths);
    },
    [moveInto]
  );

  const handleSidebarDrop = useCallback(
    (destDir: string, paths: string[]) => {
      moveInto(destDir, paths);
    },
    [moveInto]
  );

  const handleSearchSubmit = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) return;
    searchOriginRef.current = history.currentPath;
    setSearchMode(true);
    deepSearch.start(history.currentPath, q);
  }, [searchQuery, history.currentPath, deepSearch]);

  const handleSearchChange = useCallback(
    (v: string) => {
      setSearchQuery(v);
      if (searchMode && v.trim() === "") exitSearch();
    },
    [searchMode, exitSearch]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isEditable) return;
      if (contextMenu) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(displayedEntries.map((en) => en.path)));
        setLastSelectedIndex(displayedEntries.length - 1);
      } else if (mod && e.key.toLowerCase() === "c") {
        if (selected.size) {
          e.preventDefault();
          setClipboard({ paths: Array.from(selected), mode: "copy" });
        }
      } else if (mod && e.key.toLowerCase() === "x") {
        if (selected.size) {
          e.preventDefault();
          setClipboard({ paths: Array.from(selected), mode: "cut" });
        }
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        doPaste();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        doCreateFolder();
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (mod && e.key === "[") {
        e.preventDefault();
        history.goBack();
      } else if (mod && e.key === "]") {
        e.preventDefault();
        history.goForward();
      } else if (mod && e.key === "ArrowUp") {
        e.preventDefault();
        history.goUp();
      } else if (e.key === "Delete" || (mod && e.key === "Backspace")) {
        if (selected.size) {
          e.preventDefault();
          doDelete(Array.from(selected));
        }
      } else if (e.key === "Enter") {
        if (selected.size === 1) {
          e.preventDefault();
          const entry = displayedEntries.find((en) => selected.has(en.path));
          if (entry) onOpen(entry);
        }
      } else if (e.key === "F2") {
        if (selected.size === 1) {
          e.preventDefault();
          setRenamingPath(Array.from(selected)[0]);
        }
      } else if (e.key === "Escape") {
        setSelected(new Set());
        if (searchMode) exitSearch();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const cur = lastSelectedIndex ?? -1;
        const next = Math.min(Math.max(cur + delta, 0), displayedEntries.length - 1);
        const entry = displayedEntries[next];
        if (entry) {
          setSelected(new Set([entry.path]));
          setLastSelectedIndex(next);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        setPreviewVisible(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    contextMenu,
    displayedEntries,
    selected,
    lastSelectedIndex,
    doPaste,
    doCreateFolder,
    doDelete,
    onOpen,
    history,
    searchMode,
    exitSearch,
    setPreviewVisible,
  ]);

  const contextActions = useMemo<MenuAction[]>(() => {
    if (!contextMenu) return [];
    const target = contextMenu.targetPath ? displayedEntries.find((e) => e.path === contextMenu.targetPath) : null;
    const targets = target
      ? selected.has(target.path) && selected.size > 1
        ? selectedEntries
        : [target]
      : [];

    if (!target) {
      const actions: MenuAction[] = [
        { key: "new-folder", label: "New Folder", icon: MenuIcons.FolderPlus, onSelect: doCreateFolder },
        { key: "new-file", label: "New File", icon: MenuIcons.FilePlus, onSelect: doCreateFile },
      ];
      if (clipboard && clipboard.paths.length && !searchMode) {
        actions.push({
          key: "paste",
          label: `Paste ${clipboard.paths.length} item${clipboard.paths.length === 1 ? "" : "s"}`,
          icon: MenuIcons.ClipboardPaste,
          separatorBefore: true,
          onSelect: doPaste,
        });
      }
      return actions;
    }

    const paths = targets.map((t) => t.path);
    const actions: MenuAction[] = [
      { key: "open", label: "Open", icon: MenuIcons.FolderOpen, onSelect: () => onOpen(target) },
    ];
    actions.push({
      key: "info",
      label: "Get Info",
      icon: MenuIcons.Info,
      separatorBefore: true,
      onSelect: () => setPreviewVisible(true),
    });
    if (targets.length === 1) {
      actions.push({
        key: "rename",
        label: "Rename",
        icon: MenuIcons.PencilLine,
        onSelect: () => setRenamingPath(target.path),
      });
    }
    actions.push(
      { key: "cut", label: "Cut", icon: MenuIcons.Scissors, separatorBefore: true, onSelect: () => setClipboard({ paths, mode: "cut" }) },
      { key: "copy", label: "Copy", icon: MenuIcons.Copy, onSelect: () => setClipboard({ paths, mode: "copy" }) }
    );
    if (clipboard && clipboard.paths.length && !searchMode) {
      actions.push({
        key: "paste",
        label: `Paste ${clipboard.paths.length} item${clipboard.paths.length === 1 ? "" : "s"}`,
        icon: MenuIcons.ClipboardPaste,
        onSelect: doPaste,
      });
    }
    actions.push({
      key: "delete",
      label: `Move to Trash`,
      icon: MenuIcons.Trash2,
      danger: true,
      separatorBefore: true,
      onSelect: () => doDelete(paths),
    });
    actions.push({
      key: "reveal",
      label: "Reveal in Finder",
      icon: MenuIcons.ExternalLink,
      separatorBefore: true,
      onSelect: () => window.fileAPI.showInFolder(target.path),
    });
    return actions;
  }, [
    contextMenu,
    displayedEntries,
    selected,
    selectedEntries,
    clipboard,
    searchMode,
    doCreateFolder,
    doCreateFile,
    doPaste,
    doDelete,
    onOpen,
    setPreviewVisible,
  ]);

  if (!ready || !sep) {
    return (
      <div className="loading-splash">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="titlebar" />
      <div className="app-body">
        <Sidebar
          quickAccess={quickAccess}
          volumes={volumes}
          currentPath={history.currentPath}
          onNavigate={(p) => {
            if (searchMode) exitSearch();
            history.navigate(p);
          }}
          isDropTarget={sidebarDropTarget}
          onDropPaths={handleSidebarDrop}
          onDragOverPath={setSidebarDropTarget}
        />
        <div className="main-pane">
          <Toolbar
            path={history.currentPath}
            sep={sep}
            onNavigate={(p) => {
              if (searchMode) exitSearch();
              history.navigate(p);
            }}
            canGoBack={history.canGoBack}
            canGoForward={history.canGoForward}
            onBack={history.goBack}
            onForward={history.goForward}
            onUp={history.goUp}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSearchSubmit={handleSearchSubmit}
            onClearSearch={exitSearch}
            searchMode={searchMode}
            searching={deepSearch.searching}
            searchInputRef={searchInputRef}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={(k, d) => {
              setSortKey(k);
              setSortDir(d);
            }}
            showHidden={showHidden}
            onToggleHidden={() => setShowHidden((v) => !v)}
            onNewFolder={doCreateFolder}
            onNewFile={doCreateFile}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            previewVisible={previewVisible}
            onTogglePreview={() => setPreviewVisible((v) => !v)}
          />

          {notice && (
            <div className="notice-banner" onClick={() => setNotice(null)}>
              {notice}
            </div>
          )}

          {dirListing.loading && !searchMode ? (
            <div className="loading-splash inline">
              <div className="loading-spinner" />
            </div>
          ) : dirListing.error && !searchMode ? (
            <div className="file-view empty">
              <div className="empty-state">{dirListing.error}</div>
            </div>
          ) : (
            <FileView
              entries={displayedEntries}
              viewMode={viewMode}
              selected={selected}
              cutPaths={cutPaths}
              renamingPath={renamingPath}
              dropTargetPath={dropTargetPath}
              subtitleFor={subtitleFor}
              onItemMouseDown={onItemMouseDown}
              onItemClick={onItemClick}
              onItemContextMenu={onItemContextMenu}
              onOpen={onOpen}
              onBackgroundMouseDown={onBackgroundMouseDown}
              onBackgroundContextMenu={onBackgroundContextMenu}
              onDragStartEntry={onDragStartEntry}
              onDragOverEntry={onDragOverEntry}
              onDragLeaveEntry={onDragLeaveEntry}
              onDropEntry={onDropEntry}
              onRenameCommit={doRename}
              onRenameCancel={() => setRenamingPath(null)}
              onExternalDrop={handleExternalDrop}
            />
          )}

          <StatusBar
            itemCount={displayedEntries.length}
            selectedCount={selected.size}
            selectedSize={selectedSize}
          />
        </div>
        {previewVisible && (
          <PreviewPanel entry={previewEntry} selectionCount={selected.size} selectionSize={selectedSize} />
        )}
      </div>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextActions} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
