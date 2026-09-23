import {
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronUp,
  FolderPlus,
  FilePlus,
  LayoutGrid,
  List,
  Search,
  X,
  Sun,
  Moon,
  PanelRight,
  EyeOff,
  Eye,
  Database,
} from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import type { SortDir, SortKey, ViewMode } from "../types";

interface ToolbarProps {
  path: string;
  sep: string;
  onNavigate: (path: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  onClearSearch: () => void;
  searchMode: boolean;
  searching: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  previewVisible: boolean;
  onTogglePreview: () => void;
  smartSearchOpen: boolean;
  onToggleSmartSearch: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const {
    path,
    sep,
    onNavigate,
    canGoBack,
    canGoForward,
    onBack,
    onForward,
    onUp,
    searchQuery,
    onSearchChange,
    onSearchSubmit,
    onClearSearch,
    searchMode,
    searching,
    searchInputRef,
    viewMode,
    onViewModeChange,
    sortKey,
    sortDir,
    onSortChange,
    showHidden,
    onToggleHidden,
    onNewFolder,
    onNewFile,
    theme,
    onToggleTheme,
    previewVisible,
    onTogglePreview,
    smartSearchOpen,
    onToggleSmartSearch,
  } = props;

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="nav-buttons">
          <button className="icon-btn" disabled={!canGoBack} onClick={onBack} title="Back">
            <ChevronLeft size={17} />
          </button>
          <button className="icon-btn" disabled={!canGoForward} onClick={onForward} title="Forward">
            <ChevronRightIcon size={17} />
          </button>
          <button className="icon-btn" onClick={onUp} title="Go up">
            <ChevronUp size={17} />
          </button>
        </div>

        {searchMode ? (
          <div className="search-results-label">Search results</div>
        ) : (
          <Breadcrumbs path={path} sep={sep} onNavigate={onNavigate} />
        )}

        <div className="toolbar-spacer" />

        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="Search"
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
              if (e.key === "Escape") onClearSearch();
            }}
          />
          {searching && <span className="search-spinner" />}
          {searchQuery && (
            <button className="search-clear" onClick={onClearSearch} title="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-row secondary">
        <button className="icon-btn" onClick={onNewFolder} title="New Folder (⇧⌘N)">
          <FolderPlus size={16} />
        </button>
        <button className="icon-btn" onClick={onNewFile} title="New File">
          <FilePlus size={16} />
        </button>

        <div className="toolbar-divider" />

        <div className="segmented">
          <button
            className={viewMode === "list" ? "active" : ""}
            onClick={() => onViewModeChange("list")}
            title="List view"
          >
            <List size={15} />
          </button>
          <button
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => onViewModeChange("grid")}
            title="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        <select
          className="sort-select"
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [SortKey, SortDir];
            onSortChange(key, dir);
          }}
          title="Sort by"
        >
          <option value="name:asc">Name (A–Z)</option>
          <option value="name:desc">Name (Z–A)</option>
          <option value="modified:desc">Date Modified (Newest)</option>
          <option value="modified:asc">Date Modified (Oldest)</option>
          <option value="size:desc">Size (Largest)</option>
          <option value="size:asc">Size (Smallest)</option>
          <option value="kind:asc">Kind</option>
        </select>

        <button className="icon-btn" onClick={onToggleHidden} title="Toggle hidden files">
          {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>

        <button
          className={`icon-btn${smartSearchOpen ? " active" : ""}`}
          onClick={onToggleSmartSearch}
          title="Indexed search"
        >
          <Database size={15} />
        </button>

        <div className="toolbar-spacer" />

        <button
          className={`icon-btn${previewVisible ? " active" : ""}`}
          onClick={onTogglePreview}
          title="Toggle preview panel"
        >
          <PanelRight size={16} />
        </button>
        <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </div>
  );
}
