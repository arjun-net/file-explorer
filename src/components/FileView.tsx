import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../api";
import type { ViewMode } from "../types";
import { iconForEntry } from "../utils/fileIcon";
import { formatBytes, formatDate, kindLabel } from "../utils/format";

interface FileViewProps {
  entries: FileEntry[];
  viewMode: ViewMode;
  selected: Set<string>;
  cutPaths: Set<string>;
  renamingPath: string | null;
  dropTargetPath: string | null;
  subtitleFor?: (entry: FileEntry) => string | undefined;
  onItemMouseDown: (entry: FileEntry, index: number, e: React.MouseEvent) => void;
  onItemClick: (entry: FileEntry, e: React.MouseEvent) => void;
  onItemContextMenu: (entry: FileEntry, e: React.MouseEvent) => void;
  onOpen: (entry: FileEntry) => void;
  onBackgroundMouseDown: (e: React.MouseEvent) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  onDragStartEntry: (entry: FileEntry, e: React.DragEvent) => void;
  onDragOverEntry: (entry: FileEntry, e: React.DragEvent) => void;
  onDragLeaveEntry: () => void;
  onDropEntry: (entry: FileEntry, e: React.DragEvent) => void;
  onRenameCommit: (entry: FileEntry, newName: string) => void;
  onRenameCancel: () => void;
  onExternalDrop: (paths: string[]) => void;
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <input
      ref={ref}
      className="rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const trimmed = value.trim();
          if (trimmed) onCommit(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initial) onCommit(trimmed);
        else onCancel();
      }}
    />
  );
}

export function FileView(props: FileViewProps) {
  const {
    entries,
    viewMode,
    selected,
    cutPaths,
    renamingPath,
    dropTargetPath,
    subtitleFor,
    onItemMouseDown,
    onItemClick,
    onItemContextMenu,
    onOpen,
    onBackgroundMouseDown,
    onBackgroundContextMenu,
    onDragStartEntry,
    onDragOverEntry,
    onDragLeaveEntry,
    onDropEntry,
    onRenameCommit,
    onRenameCancel,
    onExternalDrop,
  } = props;

  function handleContainerDrop(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes("application/x-file-paths")) {
      e.preventDefault();
      const paths: string[] = [];
      for (const file of Array.from(e.dataTransfer.files)) {
        const p = window.electronPathFor?.(file);
        if (p) paths.push(p);
      }
      if (paths.length) onExternalDrop(paths);
    }
  }

  if (entries.length === 0) {
    return (
      <div
        className="file-view empty"
        onMouseDown={onBackgroundMouseDown}
        onContextMenu={onBackgroundContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleContainerDrop}
      >
        <div className="empty-state">This folder is empty</div>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div
        className="file-view grid"
        onMouseDown={onBackgroundMouseDown}
        onContextMenu={onBackgroundContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleContainerDrop}
      >
        {entries.map((entry, index) => {
          const Icon = iconForEntry(entry);
          const isSelected = selected.has(entry.path);
          return (
            <div
              key={entry.path}
              className={`grid-item${isSelected ? " selected" : ""}${cutPaths.has(entry.path) ? " cut" : ""}${
                dropTargetPath === entry.path ? " drop-target" : ""
              }`}
              draggable={renamingPath !== entry.path}
              onMouseDown={(e) => onItemMouseDown(entry, index, e)}
              onClick={(e) => onItemClick(entry, e)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => onItemContextMenu(entry, e)}
              onDragStart={(e) => onDragStartEntry(entry, e)}
              onDragOver={(e) => {
                if (entry.isDirectory) onDragOverEntry(entry, e);
              }}
              onDragLeave={onDragLeaveEntry}
              onDrop={(e) => onDropEntry(entry, e)}
            >
              <Icon size={40} strokeWidth={1.25} className="grid-icon" />
              {renamingPath === entry.path ? (
                <RenameInput
                  initial={entry.name}
                  onCommit={(v) => onRenameCommit(entry, v)}
                  onCancel={onRenameCancel}
                />
              ) : (
                <span className="grid-name">{entry.name}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="file-view list"
      onMouseDown={onBackgroundMouseDown}
      onContextMenu={onBackgroundContextMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleContainerDrop}
    >
      <div className="list-header">
        <div className="col-name">Name</div>
        <div className="col-modified">Date Modified</div>
        <div className="col-size">Size</div>
        <div className="col-kind">Kind</div>
      </div>
      <div className="list-body">
        {entries.map((entry, index) => {
          const Icon = iconForEntry(entry);
          const isSelected = selected.has(entry.path);
          const subtitle = subtitleFor?.(entry);
          return (
            <div
              key={entry.path}
              className={`list-row${isSelected ? " selected" : ""}${cutPaths.has(entry.path) ? " cut" : ""}${
                dropTargetPath === entry.path ? " drop-target" : ""
              }`}
              draggable={renamingPath !== entry.path}
              onMouseDown={(e) => onItemMouseDown(entry, index, e)}
              onClick={(e) => onItemClick(entry, e)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => onItemContextMenu(entry, e)}
              onDragStart={(e) => onDragStartEntry(entry, e)}
              onDragOver={(e) => {
                if (entry.isDirectory) onDragOverEntry(entry, e);
              }}
              onDragLeave={onDragLeaveEntry}
              onDrop={(e) => onDropEntry(entry, e)}
            >
              <div className="col-name">
                <Icon size={18} strokeWidth={1.5} className="row-icon" />
                {renamingPath === entry.path ? (
                  <RenameInput
                    initial={entry.name}
                    onCommit={(v) => onRenameCommit(entry, v)}
                    onCancel={onRenameCancel}
                  />
                ) : (
                  <div className="name-block">
                    <span className="row-name">{entry.name}</span>
                    {subtitle && <span className="row-subtitle">{subtitle}</span>}
                  </div>
                )}
              </div>
              <div className="col-modified">{formatDate(entry.mtimeMs)}</div>
              <div className="col-size">{entry.isDirectory ? "—" : formatBytes(entry.size)}</div>
              <div className="col-kind">{kindLabel(entry)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
