import * as XLSX from "xlsx";
import type { ImportEntityType } from "@/financial-engine/types";
import { analyzeSheet, cellText, cellToDate, cellToNumber, detectColumns, isErrorCell } from "./detect";
import { classifyCategory, classifyType, normalizeBankName, normalizeCurrency, normalizeStatus } from "./normalize";
import { MAX_IMPORT_ROWS, type DetectedColumn, type ImportSummary, type ProcessedRecord, type SheetResult, type ImportOverrides } from "./types";
import { validateRecord } from "./validate";

export interface WorkSheetData { name: string; rows: unknown[][]; }

/** Preserve cell types, errors, leading zeros and original Excel row numbers. */
export async function parseWorkbook(buffer: ArrayBuffer): Promise<WorkSheetData[]> {
  const bytes = new Uint8Array(buffer);
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b) && !(bytes[0] === 0xd0 && bytes[1] === 0xcf))
    throw new Error("El contenido no corresponde a un libro Excel válido. Abre el archivo en Excel y guárdalo como .xlsx.");
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, bookVBA: false, cellFormula: true });
  const sheets: WorkSheetData[] = [];
  let cells = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    cells += (range.e.r + 1) * (range.e.c + 1);
    if (range.e.r > 100000 || range.e.c > 255 || cells > 2000000)
      throw new Error("El libro excede el área de lectura. Divide los datos o elimina filas/columnas vacías con formato.");
    const rows: unknown[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row: unknown[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        row.push(cell ? { t: cell.t, v: cell.v, w: cell.w, f: cell.f, date1904: !!wb.Workbook?.WBProps?.date1904 } : "");
      }
      rows.push(row);
    }
    if (rows.some((r) => r.some((c) => cellText(c).trim()))) sheets.push({ name, rows });
  }
  return sheets;
}

const pick = (columns: DetectedColumn[], row: unknown[], key: string) => {
  const col = columns.find((c) => c.key === key);
  return col ? row[col.index] : undefined;
};

export function processWorkbook(sheets: WorkSheetData[], onProgress?: (done: number, total: number, phase: string) => void, overrides: ImportOverrides = {}): ImportSummary {
  const records: ProcessedRecord[] = [], sheetResults: SheetResult[] = [];
  const seen = new Set<string>();
  for (const [sheetIndex, sheet] of sheets.entries()) {
    onProgress?.(sheetIndex + 1, sheets.length, `Analizando hoja “${sheet.name}”…`);
    const override = overrides[sheet.name] ?? {};
    const detected = analyzeSheet(sheet.name, sheet.rows);
    const headerIndex = override.headerIndex ?? detected?.headerIndex ?? 1;
    const header = sheet.rows[headerIndex - 1] ?? [];
    let columns = detectColumns(header);
    if (override.mapping) {
      for (const [key, index] of Object.entries(override.mapping)) {
        columns = columns.filter((c) => c.key !== key);
        if (index >= 0 && index < header.length) columns.push({ key, index, header: cellText(header[index]) || `Columna ${index + 1}`, type: "string" });
      }
    }
    const entityType = override.entityType ?? detected?.entityType ?? "unknown";
    const analysis: SheetResult = { name: sheet.name, headerIndex, columns, entityType, dataRows: 0,
      headers: header.map(cellText), sample: sheet.rows.slice(0, 8).map((row) => row.map(cellText)) };
    sheetResults.push(analysis);
    if (override.skip) continue;
    for (let i = headerIndex; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      if (!row.some((c) => cellText(c).trim() !== "")) continue;
      analysis.dataRows++;
      const n = normalizeRow(entityType, columns, row, override.numberLocale);
      const issues = validateRecord({ ...n, entityType, currencyKnown: n.currencyKnown === true });
      for (const col of columns) {
        const cell = row[col.index] as { f?: string; v?: unknown } | undefined;
        if (isErrorCell(cell)) issues.push({ kind: "error", message: `La columna “${col.header}” contiene un error de Excel.` });
        if (cell && typeof cell === "object" && cell.f && cell.v === undefined)
          issues.push({ kind: "error", message: `La fórmula de “${col.header}” no tiene resultado. Recalcula y guarda el libro en Excel.` });
      }
      // Debe/Haber are ledger columns; Cargo/Abono are bank-statement columns.
      const d = cellToNumber(pick(columns, row, "amountDebe"), override.numberLocale) ?? cellToNumber(pick(columns, row, "credit"), override.numberLocale);
      const h = cellToNumber(pick(columns, row, "amountHaber"), override.numberLocale) ?? cellToNumber(pick(columns, row, "charge"), override.numberLocale);
      if ((d ?? 0) > 0 && (h ?? 0) > 0) issues.push({ kind: "error", message: "Ambos lados tienen monto. Separa el ingreso y el egreso en dos filas." });
      if ([d, h].some((v) => v !== null && v < 0)) issues.push({ kind: "error", message: "Debe/Haber y Cargo/Abono deben ser positivos; usa Monto para valores con signo." });
      if (n.typeInferred) issues.push({ kind: "warning", message: "Tipo de movimiento inferido por la descripción; revísalo antes de confirmar." });
      if (n.statusInvalid) issues.push({ kind: "error", message: "Estado no compatible con el destino seleccionado." });
      const dedupeKey = JSON.stringify([entityType, n.document, n.customer, n.rut, n.account, n.bank, n.currency, n.amount, n.type, n.date, n.issueDate, n.dueDate, n.startDate, n.endDate, n.description, n.rate, n.interest]);
      const baseStatus = issues.some((x) => x.kind === "error") ? "ERROR" : issues.length ? "WARNING" : "VALID";
      const status = baseStatus !== "ERROR" && seen.has(dedupeKey) ? "DUPLICATE" : baseStatus;
      if (status === "VALID" || status === "WARNING") seen.add(dedupeKey);
      const raw = Object.fromEntries(row.map((v, c) => [`${cellText(header[c]) || `Columna ${c + 1}`} [${c + 1}]`, cellText(v)]));
      records.push({ sheet: sheet.name, row: i + 1, status, entityType, normalized: n, raw,
        warnings: status === "DUPLICATE" ? "Fila idéntica a otra del archivo." : issues.map((x) => x.message).join(" · "), dedupeKey });
      if (records.length > MAX_IMPORT_ROWS) throw new Error(`El libro supera ${MAX_IMPORT_ROWS.toLocaleString("es-CL")} filas. Divídelo en archivos más pequeños.`);
    }
  }
  return { fileName: "", sheets: sheetResults, total: records.length,
    valid: records.filter((r) => r.status === "VALID").length,
    warning: records.filter((r) => r.status === "WARNING").length,
    error: records.filter((r) => r.status === "ERROR").length,
    duplicate: records.filter((r) => r.status === "DUPLICATE").length, records };
}

function normalizeRow(entityType: ImportEntityType, columns: DetectedColumn[], row: unknown[], locale: "es-CL" | "en-US" = "es-CL"): Record<string, unknown> {
  const get = (key: string) => pick(columns, row, key);
  const text = (key: string) => cellText(get(key)).trim() || null;
  const numeric = (key: string) => cellToNumber(get(key), locale);
  const description = text("description") ?? "";
  const amount = numeric("amount"), debe = numeric("amountDebe") ?? numeric("credit"), haber = numeric("amountHaber") ?? numeric("charge");
  const currency = columns.some((c) => c.key === "currency") ? normalizeCurrency(text("currency")) : { currency: "CLP", known: true };
  const explicitType = (text("type") ?? "").toLowerCase();
  const typeAliases: Record<string, string> = { ingreso: "income", income: "income", egreso: "expense", expense: "expense", cargo: "expense", abono: "income" };
  const type = typeAliases[explicitType] ?? ((amount ?? 0) < 0 ? "expense" : classifyType(debe, haber, description));
  const statuses: Record<string, string[]> = {
    cash_flow: ["conciliado", "confirmado", "programado", "pendiente", "proyectado", "borrador", "pagado", "cancelado", "vencido"],
    projection: ["proyectado", "confirmado", "cancelado", "borrador"],
    invoice: ["pagado", "vencido", "por_vencer", "vence_pronto"],
    customer: ["activo", "inactivo"], investment: ["vigente", "por_vencer", "rescatada", "rescate_programado"],
  };
  const status = normalizeStatus(text("status"));
  const n: Record<string, unknown> = {
    entityType, description, bank: normalizeBankName(get("bank") == null ? null : text("bank")),
    currency: currency.currency, currencyKnown: currency.known, type, status,
    statusInvalid: !!status && !(statuses[entityType] ?? []).includes(status),
    amount: amount === null ? (debe || haber || null) : ((entityType === "cash_flow" || entityType === "projection") ? Math.abs(amount) : amount),
    debe, haber, category: classifyCategory(type as "income" | "expense", description),
    typeInferred: (entityType === "cash_flow" || entityType === "projection") && !typeAliases[explicitType] && !debe && !haber && !(amount !== null && amount < 0),
  };
  for (const key of ["date", "issueDate", "dueDate", "startDate", "endDate"]) n[key] = cellToDate(get(key)).iso;
  if (!n.issueDate && !columns.some((c) => c.key === "issueDate")) n.issueDate = n.date;
  for (const key of ["customer", "rut", "document", "account", "company"]) n[key] = text(key);
  n.rate = numeric("rate"); n.interest = numeric("interest");
  n.investmentType = description.toLowerCase().includes("fondo") ? "fondo_mutuo" : "colocacion";
  return n;
}
