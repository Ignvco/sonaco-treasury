import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

/** Consistent filter select styled by the design system. */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "Todos",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("t-input min-w-[130px] cursor-pointer", className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Filter bar shell: label + controls. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </span>
      {children}
    </div>
  );
}
