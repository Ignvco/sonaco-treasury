import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";

/** Styled chart tooltip shared by all treasury charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  currency?: string;
}) {
  const { money } = useCurrency();
  if (!active || !payload || payload.length === 0) return null;
  const names: Record<string, string> = {
    income: "Ingresos",
    expense: "Egresos",
    final: "Saldo proyectado",
    initial: "Saldo inicial",
    available: "Disponible",
  };
  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-card px-3 py-2.5 shadow-soft">
      {label && <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload
          .filter((p) => p.value !== undefined)
          .map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.color ?? "#0320A5" }}
                />
                {names[p.dataKey ?? p.name ?? ""] ?? p.name}
              </span>
              <span className="t-num text-[12px] font-semibold text-foreground">
                {money(p.value ?? 0)}
              </span>
            </div>
          ))}
      </div>
      {currency && <p className="mt-1 text-[10px] text-muted-foreground/70">{currency}</p>}
    </div>
  );
}

/** Segmented period toggle: Diario / Semanal / Mensual. */
export function PeriodToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-all duration-200",
            value === o.value
              ? "bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
