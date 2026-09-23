import { useEffect, useRef } from "react";
import {
  FolderPlus,
  FilePlus,
  Scissors,
  Copy,
  ClipboardPaste,
  PencilLine,
  Trash2,
  FolderOpen,
  Info,
  ExternalLink,
} from "lucide-react";

export interface MenuAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: MenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleDown, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  const menuWidth = 210;
  const menuHeight = actions.length * 30 + 16;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div ref={ref} className="context-menu" style={{ left, top }}>
      {actions.map((action) => (
        <div key={action.key}>
          {action.separatorBefore && <div className="context-menu-sep" />}
          <button
            className={`context-menu-item${action.danger ? " danger" : ""}`}
            disabled={action.disabled}
            onClick={() => {
              action.onSelect();
              onClose();
            }}
          >
            {action.icon && <action.icon size={15} strokeWidth={1.75} />}
            <span>{action.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export const MenuIcons = {
  FolderPlus,
  FilePlus,
  Scissors,
  Copy,
  ClipboardPaste,
  PencilLine,
  Trash2,
  FolderOpen,
  Info,
  ExternalLink,
};
