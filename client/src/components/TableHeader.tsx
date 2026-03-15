import { useState, useCallback, useRef, useEffect } from "react";

// ── Sort hook ──────────────────────────────────────────────

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null;

export function useSort<K extends string>(initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback((key: K) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === "asc" ? { key, dir: "desc" } : null;
      }
      return { key, dir: "asc" };
    });
  }, []);

  function sorted<T>(rows: T[], accessor: (row: T, key: K) => string | number): T[] {
    if (!sort) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const va = accessor(a, key);
      const vb = accessor(b, key);
      if (typeof va === "number" && typeof vb === "number") {
        return dir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }

  return { sort, toggle, sorted };
}

// ── Sortable + Resizable column header ─────────────────────

interface ColHeaderProps {
  label: string;
  sortKey?: string;
  sort: SortState | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSort?: (key: any) => void;
  align?: "left" | "right" | "center";
  resizable?: boolean;
  className?: string;
}

export function ColHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  resizable = true,
  className = "",
}: ColHeaderProps) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const isSorted = sortKey != null && sort?.key === sortKey;
  const dir = isSorted && sort ? sort.dir : null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!thRef.current) return;
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = thRef.current.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !thRef.current) return;
      const delta = e.clientX - startX.current;
      const newW = Math.max(48, startW.current + delta);
      thRef.current.style.width = `${newW}px`;
      thRef.current.style.minWidth = `${newW}px`;
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const textAlign = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th
      ref={thRef}
      className={`${textAlign} px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider relative select-none ${className}`}
      style={{ position: "relative" }}
    >
      {sortKey && onSort ? (
        <button
          onClick={() => onSort(sortKey)}
          className="inline-flex items-center gap-1 cursor-pointer hover:text-noc-text-bright transition-colors group"
        >
          {label}
          <span className="inline-flex flex-col text-[8px] leading-none ml-0.5">
            <span className={dir === "asc" ? "text-noc-amber" : "text-noc-border opacity-0 group-hover:opacity-50"}>▲</span>
            <span className={dir === "desc" ? "text-noc-amber" : "text-noc-border opacity-0 group-hover:opacity-50"}>▼</span>
          </span>
        </button>
      ) : (
        label
      )}
      {resizable && (
        <span
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-noc-amber/30 transition-colors"
        />
      )}
    </th>
  );
}
