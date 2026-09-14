import { useMemo, useState } from "react";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NoResults } from "./feedback";

export interface DataColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  hideBelow?: "md" | "lg";
}

interface DataTableProps<T> {
  storageKey?: string;
  columns: DataColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  search?: boolean;
  searchText?: (row: T) => string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
}

/** Premium data table: sticky header, hover rows, sorting, search, pagination. */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  search = false,
  searchText,
  pageSize = 8,
  onRowClick,
  actions,
  emptyTitle = "Sin registros",
  emptyDescription = "No hay información para mostrar en esta tabla.",
  defaultSort,
  storageKey = "",
}: DataTableProps<T>) {
  const [preferences,setPreferences]=useSavedFilters(storageKey ? "table:"+storageKey : "", {query:"",sortKey:defaultSort?.key??"",sortDir:defaultSort?.dir??"asc"});
  const sort=preferences.sortKey?{key:preferences.sortKey,dir:preferences.sortDir as "asc"|"desc"}:null;
  const query=preferences.query;
  const setQuery=(value:string)=>setPreferences(p=>({...p,query:value}));
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = data;
    if (search && query.trim() && searchText) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => searchText(r).toLowerCase().includes(q));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const getter = col?.sortValue;
      if (getter) {
        const dir = sort.dir === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const va = getter(a);
          const vb = getter(b);
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb), "es") * dir;
        });
      }
    }
    return rows;
  }, [data, query, search, searchText, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (col: DataColumn<T>) => {
    if (!col.sortValue) return;
    setPreferences(p=>({...p,sortKey:col.key,sortDir:p.sortKey===col.key&&p.sortDir==="asc"?"desc":"asc"}));
    setPage(1);
  };

  const resetFilters = () => {
    setQuery("");
    setPreferences(p=>({...p,sortKey:"",sortDir:"asc"}));
    setPage(1);
  };

  return (
    <div className="flex flex-col">
      {search && (
        <div className="relative mb-3 w-full max-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Buscar en la tabla"
            placeholder="Buscar…"
            className="t-input w-full pl-8"
          />
        </div>
      )}

      <div className="max-h-[560px] max-w-full overflow-auto rounded-[16px] border border-[#EAEAEA]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
            <tr className="border-b border-[#EAEAEA]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "whitespace-nowrap px-4 py-3.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.hideBelow === "md" && "hidden md:table-cell",
                    col.hideBelow === "lg" && "hidden lg:table-cell",
                  )}
                >
                  {col.sortValue ? (
                    <button
                      onClick={() => toggleSort(col)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        sort?.key === col.key && "text-brand",
                      )}
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              {actions && <th className="w-10 px-2 py-3" />}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => { if (onRowClick && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onRowClick(row); } }}
                className={cn(
                  "border-b border-[#F1F1F1] last:border-0",
                  onRowClick && "cursor-pointer",
                  "transition-colors hover:bg-brand-soft/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-4 text-[13px] text-foreground",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.align === "right" && "t-num",
                      col.hideBelow === "md" && "hidden md:table-cell",
                      col.hideBelow === "lg" && "hidden lg:table-cell",
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
                  </td>
                ))}
                {actions && <td className="px-2 py-4 text-right">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {slice.length === 0 && (
          query || sort ? <NoResults onReset={resetFilters} /> : <div className="px-5 py-10 text-center"><p className="text-sm font-medium">{emptyTitle}</p><p className="mt-2 text-xs text-muted-foreground">{emptyDescription}</p></div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 items-center justify-between text-[12px] text-muted-foreground">
          <span className="t-num">
            Mostrando {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              aria-label="Página anterior"
              onClick={() => setPage(safePage - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 t-num">
              {safePage} / {totalPages}
            </span>
            <button
              disabled={safePage >= totalPages}
              aria-label="Página siguiente"
              onClick={() => setPage(safePage + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#EAEAEA] bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
