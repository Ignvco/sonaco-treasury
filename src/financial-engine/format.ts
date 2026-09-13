/* ============================================================
 * Formatting helpers — the UI must NEVER render NaN, null,
 * "undefined", 1900 or "#N/D". Every helper has a safe fallback.
 * ============================================================ */

import type { Currency } from "./types";

const safeNumber = (v: number): number =>
  Number.isFinite(v) ? v : 0;

/** ISO 4217 currency codes accepted by Intl.NumberFormat (UF/UTM are not). */
const ISO_CURRENCIES: Currency[] = ["CLP", "USD"];

/** Format a number as money in the given currency (es-CL locale). */
export function formatMoney(
  value: number,
  currency: Currency = "CLP",
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const v = safeNumber(value);
  const { compact = false, decimals } = opts;
  const sign = v < 0 ? "-" : "";

  // UF and UTM are Chilean inflation units, not ISO 4217 codes:
  // Intl.NumberFormat would throw "Invalid currency code" and crash the UI.
  if (!ISO_CURRENCIES.includes(currency)) {
    const digits = decimals ?? (currency === "UF" ? 2 : 0);
    const formatted = new Intl.NumberFormat("es-CL", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      notation: compact ? "compact" : "standard",
    }).format(Math.abs(v));
    return `${sign}${formatted} ${currency}`;
  }

  const { format } = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ?? (currency === "CLP" ? 0 : 2),
    maximumFractionDigits: decimals ?? (currency === "CLP" ? 0 : 2),
    notation: compact ? "compact" : "standard",
  });
  // Sign goes before the currency symbol: -$2.460.000 (not $-2.460.000)
  return `${sign}${format(Math.abs(v))}`;
}

/** Signed money: +$1.200 / -$450 */
export function formatSignedMoney(value: number, currency: Currency = "CLP"): string {
  const v = safeNumber(value);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(v), currency)}`;
}

/** Plain grouped number without currency symbol, e.g. 8.420.000 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CL").format(safeNumber(value));
}

/** Percentage with one decimal, e.g. +4.2% */
export function formatPercent(value: number, decimals = 1): string {
  const v = safeNumber(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

/** 2026-09-13 -> "13 sep" */
export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(d);
}

/** 2026-09-13 -> "13 sep 2026" */
export function formatDateMedium(iso: string): string {
  if (!iso) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** 2026-09-13 -> "13 de septiembre de 2026" */
export function formatDateLong(iso: string): string {
  if (!iso) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "29 jun 2026" -> "29 jun 2026 — 29 ago 2026" */
export function formatDateRange(fromIso: string, toIso: string): string {
  return `${formatDateMedium(fromIso)} — ${formatDateMedium(toIso)}`;
}

/** 13 sep -> weekday short, e.g. "sáb" */
export function formatDayShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { weekday: "short" }).format(d);
}

/**
 * Mask an account number: keeps last 4 digits visible.
 * 0210442493 -> **** **** 2493
 */
export function maskAccount(accountNumber: string): string {
  const clean = String(accountNumber ?? "").replace(/\D/g, "");
  if (!clean) return "—";
  if (clean.length <= 4) return clean;
  const tail = clean.slice(-4);
  return `**** **** ${tail}`;
}

/** Mask a RUT: 76543210-K -> ***.****.10-K */
export function maskRut(rut: string): string {
  const clean = String(rut ?? "").trim();
  if (!clean) return "—";
  const digits = clean.replace(/[^0-9]/g, "");
  const dv = clean.slice(-1).toUpperCase();
  if (digits.length <= 3) return `${dv}`;
  const tail = digits.slice(-2);
  return `***.***.${tail}-${dv}`;
}

/** Days between two dates (due - today). Positive = future. */
export function daysUntil(iso: string, fromIso = new Date().toISOString()): number {
  const a = new Date(iso);
  const b = new Date(fromIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function toISODate(offsetDays: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function formatAuditDate(iso: string, time: string): string {
  return `${formatDateMedium(iso)} · ${time}`;
}
