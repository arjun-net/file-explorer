import { ChevronRight } from "lucide-react";

interface BreadcrumbsProps {
  path: string;
  sep: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, sep, onNavigate }: BreadcrumbsProps) {
  const isWindows = sep === "\\";
  const rawParts = path.split(sep).filter(Boolean);
  const segments: { label: string; path: string }[] = [];

  if (isWindows) {
    let acc = "";
    for (const part of rawParts) {
      acc = acc ? `${acc}${sep}${part}` : `${part}${sep}`;
      segments.push({ label: part, path: acc });
    }
  } else {
    let acc = "";
    segments.push({ label: "/", path: "/" });
    for (const part of rawParts) {
      acc = `${acc}/${part}`;
      segments.push({ label: part, path: acc });
    }
  }

  return (
    <div className="breadcrumbs">
      {segments.map((seg, i) => (
        <span className="breadcrumb-segment" key={seg.path}>
          {i > 0 && <ChevronRight size={13} className="breadcrumb-sep" />}
          <button
            className={`breadcrumb-btn${i === segments.length - 1 ? " current" : ""}`}
            onClick={() => onNavigate(seg.path)}
          >
            {seg.label}
          </button>
        </span>
      ))}
    </div>
  );
}
