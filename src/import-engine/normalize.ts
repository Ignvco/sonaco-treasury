/* ============================================================
 * Normalización — bancos, monedas, estados, categorías.
 * Evita duplicar entidades por diferencias de escritura.
 * ============================================================ */

import { cellToNumber } from "./detect";
import type { CashFlowCategory, CashFlowType, Currency } from "@/financial-engine/types";

/* ------------------------------- Bancos ------------------------------- */

const BANK_ALIASES: Record<string, string> = {
  ITAU: "Banco Itaú",
  "ITAU $": "Banco Itaú",
  "BANCO ITAU": "Banco Itaú",
  "BANCO ITAU $": "Banco Itaú",
  "BANCO ITAÚ": "Banco Itaú",
  CHILE: "Banco de Chile",
  "BANCO DE CHILE": "Banco de Chile",
  BCI: "Banco BCI",
  "BANCO B.C.I.": "Banco BCI",
  "BANCO BCI": "Banco BCI",
  "BANCO BCI US$": "Banco BCI",
  BBVA: "Banco BBVA",
  "BANCO BBVA": "Banco BBVA",
  SANTANDER: "Banco Santander",
  "BANCO SANTANDER": "Banco Santander",
  CORPBANCA: "Corpbanca",
  SECURITY: "Banco Security",
  "BANCO SECURITY": "Banco Security",
  BICE: "Banco Bice",
  "BANCO BICE": "Banco Bice",
  SCOTIABANK: "Scotiabank",
  "BANCO SCOTIABANK": "Scotiabank",
};

/** Normaliza un nombre de banco a su forma canónica (o null si vacío). */
export function normalizeBankName(raw: unknown): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t) return null;
  const canonical = BANK_ALIASES[t];
  if (canonical) return canonical;
  // quita ruido: "511010005   Banco de Chile" → "Banco de Chile"
  const withNoCode = t.replace(/^\d+\s*/, "");
  const alias = BANK_ALIASES[withNoCode];
  if (alias) return alias;
  return titleCase(withNoCode) || null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/* ------------------------------- Monedas ------------------------------- */

const CURRENCY_ALIASES: Record<string, Currency> = {
  "1": "CLP",
  CLP: "CLP",
  PESO: "CLP",
  PESOS: "CLP",
  $: "CLP",
  "2": "USD",
  USD: "USD",
  "US$": "USD",
  US: "USD",
  DOLAR: "USD",
  DÓLAR: "USD",
  UF: "UF",
  UTM: "UTM",
};

/** Normaliza una moneda; devuelve [currency, conocida?]. */
export function normalizeCurrency(raw: unknown): { currency: Currency; known: boolean } {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t) return { currency: "CLP", known: false };
  const c = CURRENCY_ALIASES[t];
  return c ? { currency: c, known: true } : { currency: "CLP", known: false };
}

/* ------------------------------- Estados ------------------------------- */

const STATUS_ALIASES: Record<string, string> = {
  CONTABILIZADO: "conciliado",
  CONCILIADO: "conciliado",
  PAGADO: "pagado",
  PENDIENTE: "pendiente",
  PROGRAMADO: "programado",
  CONFIRMADO: "confirmado",
  PROYECTADO: "proyectado",
  BORRADOR: "borrador",
  CANCELADO: "cancelado",
  VENCIDO: "vencido",
  ACTIVO: "activo",
};

export function normalizeStatus(raw: unknown): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t) return null;
  return STATUS_ALIASES[t] ?? String(raw).trim().toLowerCase().replace(/\s+/g, "_");
}

/* ----------------------------- Categorías ----------------------------- */

const EXPENSE_HINTS = ["proveedor", "pago", "remuneracion", "impuesto", "dividendo", "credito", "leyes", "iva", "ppm", "prevision"];
const INCOME_HINTS = ["cobro", "recaudacion", "rescate", "abono", "ingreso", "venta"];

/**
 * Clasifica un movimiento como ingreso o egreso según DEBE/HABER o la descripción.
 * Convención tesorería: DEBE (débito) = ingreso · HABER (crédito) = egreso.
 */
export function classifyType(
  debe?: unknown,
  haber?: unknown,
  description?: unknown,
): CashFlowType {
  const d = num(debe);
  const h = num(haber);
  if (d && !h) return "income";
  if (h && !d) return "expense";
  if (d && h) return d >= h ? "income" : "expense";
  const desc = String(description ?? "").toLowerCase();
  if (EXPENSE_HINTS.some((k) => desc.includes(k))) return "expense";
  if (INCOME_HINTS.some((k) => desc.includes(k))) return "income";
  return "income";
}

export function classifyCategory(type: CashFlowType, description?: unknown): CashFlowCategory {
  const desc = String(description ?? "").toLowerCase();
  if (type === "income") {
    if (desc.includes("rescate")) return "investment_redemption";
    if (desc.includes("abono")) return "bank_credit";
    if (desc.includes("cobro") || desc.includes("recaudacion") || desc.includes("venta"))
      return "collection";
    return "other_income";
  }
  if (desc.includes("remuneracion")) return "payroll";
  if (desc.includes("impuesto") || desc.includes("iva") || desc.includes("ppm")) return "tax";
  if (desc.includes("dividendo")) return "dividends";
  if (desc.includes("credito") || desc.includes("amortizacion")) return "credit";
  if (desc.includes("leyes") || desc.includes("prevision")) return "social_levies";
  return "supplier";
}

/* ------------------------------ Helpers ------------------------------- */

function num(v: unknown): number { return cellToNumber(v) ?? 0; }
