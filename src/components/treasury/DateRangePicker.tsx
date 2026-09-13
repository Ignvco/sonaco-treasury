import { useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toISODate, formatDateShort } from "@/financial-engine/format";

export interface DateRange {
  from: string;
  to: string;
}

const now = new Date();
const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
const PRESETS: { label: string; value: DateRange }[] = [
  { label: "Últimos 7 días", value: { from: toISODate(-6), to: toISODate(0) } },
  { label: "Próximos 7 días", value: { from: toISODate(0), to: toISODate(7) } },
  { label: "Próximos 30 días", value: { from: toISODate(0), to: toISODate(30) } },
  { label: "Este mes", value: { from: toISODate(0).slice(0, 8) + "01", to: toISODate(0, new Date(now.getFullYear(), now.getMonth() + 1, 0)) } },
  { label: "Este trimestre", value: { from: toISODate(0, new Date(now.getFullYear(), quarterMonth, 1)), to: toISODate(0, new Date(now.getFullYear(), quarterMonth + 3, 0)) } },
];

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  compact?: boolean;
}

export function DateRangePicker({ value, onChange, compact }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const label = `${formatDateShort(value.from)} — ${formatDateShort(value.to)}`;

  const selectedPreset = PRESETS.find(
    (p) => p.value.from === value.from && p.value.to === value.to,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand",
            compact && "h-8",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(350px,calc(100vw-2rem))] p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </p>
        <div className="flex flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                onChange(p.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
                selectedPreset?.label === p.label
                  ? "bg-brand-soft font-semibold text-brand-dark"
                  : "text-foreground",
              )}
            >
              {p.label}
              {selectedPreset?.label === p.label && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-[#EAEAEA] px-2 pb-1 pt-2.5">
          <input
            type="date"
            aria-label="Fecha desde"
            max={value.to}
            value={value.from}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
            className="t-input w-full"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            aria-label="Fecha hasta"
            min={value.from}
            value={value.to}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
            className="t-input w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
