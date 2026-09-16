import type { QuickAccessEntry, VolumeInfo } from "../api";
import { iconForQuickAccess, iconForVolume } from "../utils/fileIcon";

interface SidebarProps {
  quickAccess: QuickAccessEntry[];
  volumes: VolumeInfo[];
  currentPath: string;
  onNavigate: (path: string) => void;
  isDropTarget: string | null;
  onDropPaths: (destDir: string, paths: string[]) => void;
  onDragOverPath: (path: string | null) => void;
}

export function Sidebar({
  quickAccess,
  volumes,
  currentPath,
  onNavigate,
  isDropTarget,
  onDropPaths,
  onDragOverPath,
}: SidebarProps) {
  function handleDrop(e: React.DragEvent, destDir: string) {
    e.preventDefault();
    onDragOverPath(null);
    const raw = e.dataTransfer.getData("application/x-file-paths");
    if (!raw) return;
    const paths: string[] = JSON.parse(raw);
    onDropPaths(destDir, paths);
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Favorites</div>
        <ul>
          {quickAccess.map((item) => {
            const Icon = iconForQuickAccess(item.icon);
            const active = currentPath === item.path;
            return (
              <li key={item.path}>
                <button
                  className={`sidebar-item${active ? " active" : ""}${
                    isDropTarget === item.path ? " drop-target" : ""
                  }`}
                  onClick={() => onNavigate(item.path)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOverPath(item.path);
                  }}
                  onDragLeave={() => onDragOverPath(null)}
                  onDrop={(e) => handleDrop(e, item.path)}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  <span>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-heading">Locations</div>
        <ul>
          {volumes.map((vol) => {
            const Icon = iconForVolume(vol.kind);
            const active = currentPath === vol.path;
            return (
              <li key={vol.path}>
                <button
                  className={`sidebar-item${active ? " active" : ""}${
                    isDropTarget === vol.path ? " drop-target" : ""
                  }`}
                  onClick={() => onNavigate(vol.path)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOverPath(vol.path);
                  }}
                  onDragLeave={() => onDragOverPath(null)}
                  onDrop={(e) => handleDrop(e, vol.path)}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  <span>{vol.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
