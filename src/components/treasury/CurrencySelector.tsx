import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { CURRENCIES } from "@/financial-engine/types";

const LABELS: Record<string, string> = {
  CLP: "CLP — Peso chileno",
  USD: "USD — Dólar",
  UF: "UF — Unidad de fomento",
  UTM: "UTM — Unidad tributaria",
};

/** Global currency preference (no conversion yet, ready for FX rates). */
export function CurrencySelector({ className }: { className?: string }) {
  const { currency, setCurrency, rates } = useCurrency();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Moneda de visualización"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand",
            className,
          )}
        >
          {currency}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Moneda de visualización
        </p>
        <div className="flex flex-col gap-0.5">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              disabled={!rates[c]}
              onClick={() => setCurrency(c)}
              className={cn(
                "flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
                currency === c
                  ? "bg-brand-soft font-semibold text-brand-dark"
                  : "text-foreground",
              )}
            >
              {LABELS[c]}
              {currency === c && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <p className="mt-2 border-t border-[#EAEAEA] px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
          Conversión con las tasas configuradas. Las monedas sin tasa están deshabilitadas.
        </p>
      </PopoverContent>
    </Popover>
  );
}
