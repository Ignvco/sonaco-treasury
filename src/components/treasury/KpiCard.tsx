import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { formatNumber } from "@/financial-engine/format";
import type { Currency } from "@/financial-engine/types";

interface KpiCardProps {
  label: string;
  value: number;
  valueText?: string;
  currency?: Currency;
  variation?: number; // % change, may be negative
  subtext?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  compact?: boolean;
  /** Render as plain number (counts) instead of money. */
  plain?: boolean;
}

/** KPI card: small label, large value, variation badge, subtext. */
export function KpiCard({
  label,
  value,
  valueText,
  currency,
  variation,
  subtext,
  icon: Icon,
  tone = "default",
  compact = false,
  plain = false,
}: KpiCardProps) {
  const { money } = useCurrency();
  const positive = variation === undefined || variation >= 0;

  return (
    <div className="t-card t-card-hover min-w-0 flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label">{label}</span>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
        )}
      </div>

      <div className={cn("t-kpi-value", tone === "success" && "text-success", tone === "danger" && "text-danger", compact && "text-[22px]", value < 0 && "text-danger")}>
        {valueText ?? (plain ? formatNumber(value) : money(value, currency))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {variation !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              tone === "danger"
                ? "bg-danger-soft text-danger"
                : tone === "warning"
                  ? "bg-warning-soft text-warning"
                  : positive
                    ? "bg-success-soft text-success"
                    : "bg-danger-soft text-danger",
            )}
          >
            {variation === 0 ? (
              <Minus className="h-3 w-3" />
            ) : positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {positive ? "+" : ""}
            {variation.toFixed(1)}%
          </span>
        )}
        {subtext && (
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}
