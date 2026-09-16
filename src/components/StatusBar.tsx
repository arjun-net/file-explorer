import { formatBytes } from "../utils/format";

interface StatusBarProps {
  itemCount: number;
  selectedCount: number;
  selectedSize: number;
}

export function StatusBar({ itemCount, selectedCount, selectedSize }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span>
        {itemCount} item{itemCount === 1 ? "" : "s"}
      </span>
      {selectedCount > 0 && (
        <span>
          · {selectedCount} selected{selectedSize > 0 ? ` (${formatBytes(selectedSize)})` : ""}
        </span>
      )}
    </div>
  );
}
