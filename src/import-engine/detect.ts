/* ============================================================
 * Detección de estructura: hojas, fila de encabezado, columnas,
 * tipos de celda y clasificación de entidad por hoja.
 * ============================================================ */

import type { ImportEntityType } from "@/financial-engine/types";
import type { DetectedColumn, SheetResult } from "./types";

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Sinónimos de encabezado → campo interno normalizado. */
const HEADER_SYNONYMS: Record<string, string> = {
  fecha: "date",
  fechadeemision: "issueDate",
  fechadevencimiento: "dueDate",
  fechavcto: "dueDate",
  fechamovimiento: "date",
  fechadeoperacion: "date",
  fechadepago: "date",
  nrodocumento: "document",
  numerofactura: "document",
  nfactura: "document",
  nro: "document",
  nombrecliente: "customer",
  rutdelcliente: "rut",
  glosadocumento: "description",
  montototal: "amount",
  montoml: "amount",
  capital: "amount",
  tipomovimiento: "type",
  tipo: "type",
  egreso: "charge",
  ingreso: "credit",
  categoria: "category",
  interesestimado: "interest",
  saldocontable: "balance",
  fechadocumento: "date",
  fechadecontabilizacion: "date",
  fechacontabilizacion: "date",
  fechaemision: "date",
  fechaemisiondocto: "date",
  fechaingreso: "issueDate",
  fechavencimiento: "dueDate",
  vcto: "dueDate",
  vctoreal: "dueDate",
  vto: "dueDate",
  vencimiento: "dueDate",
  vcto2: "dueDate",
  monto: "amount",
  montoimputaciondebe: "amountDebe",
  valor: "amount",
  total: "amount",
  importe: "amount",
  debe: "amountDebe",
  haber: "amountHaber",
  cargo: "charge",
  cargoml: "charge",
  abono: "credit",
  abonoml: "credit",
  saldo: "balance",
  banco: "bank",
  cuenta: "account",
  cuentaasociada: "account",
  codigocta: "account",
  descripcioncta: "bank",
  cuentainforme: "bank",
  nombrecuenta: "bank",
  nroctacte: "account",
  numerodecuenta: "account",
  nrodecuenta: "account",
  ndecuenta: "account",
  ctacte: "account",
  nctacte: "account",
  cliente: "customer",
  razonsocial: "customer",
  nombre: "customer",
  rut: "rut",
  rutcliente: "rut",
  glosa: "description",
  glosadocuumento: "description",
  glosamovimiento: "description",
  descripcion: "description",
  detalle: "description",
  concepto: "description",
  comentarios: "description",
  estado: "status",
  status: "status",
  moneda: "currency",
  moncodigo: "currency",
  documento: "document",
  factura: "document",
  docto: "document",
  numero: "document",
  numerodocumento: "document",
  ndocto: "document",
  tipodocto: "documentType",
  tesdocnuminterno: "document",
  tasa: "rate",
  interes: "interest",
  inicio: "startDate",
  fechainicio: "startDate",
  fechadeinicio: "startDate",
  termino: "endDate",
  fechatermino: "endDate",
  fechadetermino: "endDate",
  fechadetermino2: "endDate",
  rescate: "rescue",
  operacion: "operation",
  empresa: "company",
  dias: "days",
  saldoseguncartola: "balance",
  saldoconciliado: "reconciledBalance",
  diferencia: "difference",
};

/**
 * Reglas por nombre de hoja del workbook SONACOL: fuerza el tipo de
 * entidad cuando las heurísticas no bastan (encabezados multi-nivel,
 * pivotes, columnas con códigos).
 */
const SHEET_RULES: Record<string, ImportEntityType> = {
  base: "cash_flow",
  banco: "cash_flow",
  "macro bancos": "cash_flow",
  clientes: "customer",
  facturas: "invoice",
  movimientos: "cash_flow",
  cartola: "cash_flow",
  proyecciones: "projection",
  "macro clientes": "invoice",
  proyec: "projection",
  colocaciones: "investment",
  inversiones: "investment",
  "cuadratura bancos": "reconciliation",
};

export function mapHeader(raw: string): string | null {
  const key = strip(raw).replace(/ /g, "");
  if (!key) return null;
  return HEADER_SYNONYMS[key] ?? null;
}

/** Encuentra la fila de encabezado en las primeras N filas de una hoja. */
export function detectHeaderRow(rows: unknown[][]): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 50);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r];
    const nonEmpty = cells.filter((c) => cellText(c).trim() !== "").length;
    const known = new Set(cells.map((c) => mapHeader(cellText(c))).filter(Boolean)).size;
    if (known < 2) continue;
    const score = known * 3 + Math.min(nonEmpty, 6);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  // requiere al menos 2 encabezados reconocibles
  if (bestScore < 6) return -1;
  return best;
}

/** Tipa cada columna según su encabezado. */
export function detectColumns(headerRow: unknown[]): DetectedColumn[] {
  const columns: DetectedColumn[] = [];
  headerRow.forEach((cell, idx) => {
    const header = cellText(cell).trim();
    const key = mapHeader(header);
    if (!key) return;
    const type: DetectedColumn["type"] = key.startsWith("amount")
      ? "amount"
      : key.endsWith("Date") || key === "date"
        ? "date"
        : key === "document" || key === "rut" || key === "account"
          ? "id"
          : "string";
    columns.push({ key, header, index: idx, type });
  });
  return columns;
}

/** Clasifica la entidad de la hoja por las columnas detectadas. */
export function classifyEntity(columns: DetectedColumn[]): ImportEntityType {
  const keys = new Set(columns.map((c) => c.key));
  const has = (...ks: string[]) => ks.some((k) => keys.has(k));
  const hasAll = (...ks: string[]) => ks.every((k) => keys.has(k));

  if (hasAll("document", "dueDate", "amount")) return "invoice";
  if (hasAll("rate", "startDate", "endDate")) return "investment";
  if (has("amount", "amountDebe", "amountHaber", "charge", "credit") && has("date")) return "cash_flow";
  if (has("balance", "reconciledBalance")) return "reconciliation";
  if (has("customer", "rut")) return "customer";
  return "unknown";
}

export function analyzeSheet(name: string, rows: unknown[][]): SheetResult | null {
  const headerIndex = detectHeaderRow(rows);
  if (headerIndex < 0) return null;
  const columns = detectColumns(rows[headerIndex]);
  if (columns.length < 2) return null;
  const dataRows = Math.max(0, rows.length - headerIndex - 1);
  const inferred = classifyEntity(columns);
  const rule = SHEET_RULES[strip(name)];
  const entityType = rule === "customer" && inferred === "invoice" ? "invoice" : rule ?? inferred;
  return {
    name,
    headerIndex: headerIndex + 1, // fila de Excel (1-based)
    columns,
    dataRows,
    entityType,
  };
}

/* ---------------------------- Celdas ---------------------------- */

/** Texto seguro de una celda (maneja errores #N/D, fechas serial, etc.). */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    const o = v as { t?: string; v?: unknown; w?: unknown };
    if (o.t === "e") return "#N/D"; // celda de error de Excel
    // Preserve leading zeros in identifiers without treating amounts as dates.
    return cellText(o.t === "n" && /^0\d+$/.test(String(o.w ?? "")) ? o.w : o.v ?? o.w);
  }
  return String(v);
}

/** ¿La celda es un error de Excel (#N/D, #REF!, etc.)? */
export function isErrorCell(v: unknown): boolean {
  if (typeof v === "object" && v !== null && (v as { t?: string }).t === "e") return true;
  const t = cellText(v);
  return /^#(N\/A|N\/D|REF|VALUE|DIV\/0|NUM|NAME|NULL)!?$/.test(t.toUpperCase());
}

/** Convierte una celda a fecha ISO válida o null. */
export function cellToDate(v: unknown): { iso: string | null; valid: boolean } {
  const invalid = { iso: null, valid: false };
  if (isErrorCell(v)) return invalid;
  const cell = typeof v === "object" && v !== null && !(v instanceof Date)
    ? v as { v?: unknown; date1904?: boolean } : null;
  const raw = cell ? cell.v : v;
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) return invalid;
    const iso = raw.toISOString().slice(0, 10);
    return validDate(iso) ? { iso, valid: true } : invalid;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const serial = Math.floor(raw) + (cell?.date1904 ? 1462 : 0);
    if (serial < 36526 || serial > 73415) return invalid;
    const iso = new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
    return validDate(iso) ? { iso, valid: true } : invalid;
  }
  const t = cellText(v).trim();
  let iso = t;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(t)) {
    const [day, month, y] = t.split(/[-/]/).map(Number);
    const year = y < 100 ? 2000 + y : y;
    iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return validDate(iso) ? { iso, valid: true } : invalid;
}

export function validDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso
    && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
}

/** Native numbers stay numbers. Text supports Chilean and US separators. */
export function cellToNumber(v: unknown, locale: "es-CL" | "en-US" = "es-CL"): number | null {
  if (isErrorCell(v)) return null;
  const raw = typeof v === "object" && v !== null ? (v as { v?: unknown }).v : v;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let t = cellText(raw).trim().replace(/(?:CLP|USD|UF|UTM|US\$|\$|%)/gi, "").replace(/\s/g, "");
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t);
  if (negative) t = t.slice(1, -1);
  if (!/^[+-]?\d[\d.,]*$/.test(t)) return null;
  const comma = t.lastIndexOf(","), dot = t.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    const [whole, fraction, extra] = t.split(decimal);
    if (extra !== undefined || !fraction || !/^\d+$/.test(fraction)) return null;
    const grouping = group === "." ? /^[+-]?\d{1,3}(?:\.\d{3})+$/ : /^[+-]?\d{1,3}(?:,\d{3})+$/;
    if (!grouping.test(whole)) return null;
    t = whole.split(group).join("") + "." + fraction;
  } else if (comma >= 0) {
    if ((locale === "en-US" && /^[+-]?\d{1,3}(?:,\d{3})+$/.test(t)) || /^[+-]?\d{1,3}(?:,\d{3}){2,}$/.test(t)) t = t.replace(/,/g, "");
    else if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
    else return null;
  } else if (dot >= 0) {
    if (locale === "es-CL" && /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    else if (!/^[+-]?\d+\.\d+$/.test(t)) return null;
  }
  const n = Number(t) * (negative ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}
