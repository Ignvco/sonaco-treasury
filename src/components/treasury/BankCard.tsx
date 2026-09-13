import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import type { BankPosition } from "@/financial-engine/calculations";
import { StatusBadge } from "./StatusBadge";

interface BankCardProps {
  position: BankPosition;
  onClick?: () => void;
}

/** Bank card: accounting vs reconciled vs invested balance + status. */
export function BankCard({ position, onClick }: BankCardProps) {
  const { money } = useCurrency();
  const { bank, account, available, reconciled, difference, invested, status } = position;
  const max = Math.max(available, 1);

  return (
    <div
      onClick={onClick}
      className={cn(
        "t-card t-card-hover flex cursor-pointer flex-col gap-4 p-5",
        status === "revisar" && "ring-1 ring-warning/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              status === "revisar" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand-dark",
            )}
          >
            <Landmark className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-foreground">{bank.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{account?.accountNumber}</p>
          </div>
        </div>
        <StatusBadge label={status === "revisar" ? "Revisar" : "OK"} />
      </div>

      <div>
        <p className="t-label mb-1">Saldo contable</p>
        <p className="t-kpi-value">{money(available)}</p>
      </div>

      {/* Visual proportion */}
      <div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.max(8, (available / max) * 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[#F1F1F1] pt-3">
        <div>
          <p className="t-label mb-0.5">Conciliado</p>
          <p className="t-num text-[13px] font-semibold text-foreground">
            {money(reconciled)}
          </p>
        </div>
        <div>
          <p className="t-label mb-0.5">Invertido</p>
          <p className="t-num text-[13px] font-semibold text-foreground">
            {invested > 0 ? money(invested) : "—"}
          </p>
        </div>
        <div className="col-span-2">
          <p className="t-label mb-0.5">Diferencia</p>
          <p
            className={cn(
              "t-num text-[13px] font-semibold",
              difference === 0 ? "text-success" : "text-warning",
            )}
          >
            {difference === 0 ? "Sin diferencias" : money(difference)}
          </p>
        </div>
      </div>
    </div>
  );
}
