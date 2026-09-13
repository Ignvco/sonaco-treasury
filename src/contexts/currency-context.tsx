import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth-context";
import { formatMoney } from "@/financial-engine/format";
import type { Currency } from "@/financial-engine/types";
import { dataService } from "@/services/dataService";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Format a CLP-base amount in the display (or given) currency, converting via FX rates. */
  money: (value: number, currency?: Currency, opts?: { compact?: boolean }) => string;
  /** Rate map: 1 unit of source currency = rate CLP */
  rates: Record<string, number>;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = "sonacol.currency";

const FALLBACK_RATES: Record<string, number> = { CLP: 1 };

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === "USD" || stored === "UF" || stored === "UTM" ? stored : "CLP";
  });
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);

  const userId = user?.id;
  // Load persisted FX rates (CLP base) from the database when available
  useEffect(() => {
    let alive = true;
    setRates({ CLP: 1 });
    if (!userId) return;
    dataService
      .getFxRates()
      .then((rows) => {
        if (!alive || rows.length === 0) return;
        const map: Record<string, number> = { ...FALLBACK_RATES };
        rows.forEach((r) => {
          map[r.currency] = Number(r.rateToClp) > 0 ? Number(r.rateToClp) : map[r.currency];
        });
        map.CLP = 1;
        setRates(map);
      })
      .catch(() => {
        /* keep fallback rates */
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }, []);

  const money = useCallback(
    (value: number, c?: Currency, opts?: { compact?: boolean }) => {
      const target = c ?? currency;
      const rate = rates[target];
      if (!rate || rate <= 0) return "Tasa no disponible";
      return formatMoney(value / rate, target, opts);
    },
    [currency, rates],
  );

  const value = useMemo(
    () => ({ currency, setCurrency, money, rates }),
    [currency, setCurrency, money, rates],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
