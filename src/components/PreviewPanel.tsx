import { useEffect, useState } from "react";
import type { FileEntry } from "../api";
import { iconForEntry, isPreviewableImage, isPreviewableText } from "../utils/fileIcon";
import { formatBytes, formatDate, kindLabel } from "../utils/format";

interface PreviewPanelProps {
  entry: FileEntry | null;
  selectionCount: number;
  selectionSize: number;
}

export function PreviewPanel({ entry, selectionCount, selectionSize }: PreviewPanelProps) {
  const [textPreview, setTextPreview] = useState<{ text: string; truncated: boolean } | null>(null);

  useEffect(() => {
    setTextPreview(null);
    if (entry && !entry.isDirectory && isPreviewableText(entry.extension)) {
      let cancelled = false;
      window.fileAPI.readTextPreview(entry.path).then((res) => {
        if (!cancelled) setTextPreview(res);
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [entry]);

  if (selectionCount > 1) {
    return (
      <div className="preview-panel">
        <div className="preview-empty">
          <div className="preview-multi-count">{selectionCount}</div>
          <div>items selected</div>
          <div className="preview-multi-size">{formatBytes(selectionSize)}</div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="preview-panel">
        <div className="preview-empty muted">No selection</div>
      </div>
    );
  }

  const Icon = iconForEntry(entry);

  return (
    <div className="preview-panel">
      <div className="preview-hero">
        {isPreviewableImage(entry.extension) ? (
          <img
            src={`localfile://${entry.path}`}
            alt={entry.name}
            className="preview-image"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : textPreview ? (
          <pre className="preview-text">
            {textPreview.text}
            {textPreview.truncated && <span className="preview-truncated">…truncated</span>}
          </pre>
        ) : (
          <Icon size={64} strokeWidth={1} />
        )}
      </div>
      <div className="preview-name" title={entry.name}>
        {entry.name}
      </div>
      <div className="preview-meta">
        <div className="preview-meta-row">
          <span>Kind</span>
          <span>{kindLabel(entry)}</span>
        </div>
        {!entry.isDirectory && (
          <div className="preview-meta-row">
            <span>Size</span>
            <span>{formatBytes(entry.size)}</span>
          </div>
        )}
        <div className="preview-meta-row">
          <span>Modified</span>
          <span>{formatDate(entry.mtimeMs)}</span>
        </div>
        <div className="preview-meta-row">
          <span>Created</span>
          <span>{formatDate(entry.birthtimeMs)}</span>
        </div>
        <div className="preview-meta-row path-row">
          <span>Path</span>
          <span className="preview-path" title={entry.path}>
            {entry.path}
          </span>
        </div>
      </div>
    </div>
  );
}
