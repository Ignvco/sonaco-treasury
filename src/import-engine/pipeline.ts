import * as XLSX from "xlsx";
import { findBaseSheet, readSonacol } from "./sonacol";
import type { ImportEntityType } from "@/financial-engine/types";
import { analyzeSheet, cellText, cellToDate, cellToNumber, detectColumns, isErrorCell } from "./detect";
import { classifyCategory, classifyType, normalizeBankName, normalizeCurrency, normalizeStatus } from "./normalize";
import { MAX_IMPORT_ROWS, type DetectedColumn, type ImportSummary, type ProcessedRecord, type SheetResult, type ImportOverrides } from "./types";
import { validateRecord } from "./validate";

export interface WorkSheetData {
  name: string;
  prepared?: ProcessedRecord[];
  profile?: string;
  headerIndex?: number;
  note?: string;
  rows: unknown[][];
  /** Original 1-based Excel row numbers when blank rows have been omitted. */
  rowNumbers?: number[];
}

const MAX_CONTENT_CELLS = 2000000;

/** Formatting, comments and blank stubs are not business data. Keep formulas
 * without cached values so validation can report them instead of losing a row. */
function hasCellContent(value: unknown): boolean {
  if (cellText(value).trim() !== "") return true;
  const cell = value as { f?: string; v?: unknown } | null | undefined;
  return !!cell && typeof cell === "object" && !!cell.f && cell.v == null;
}

/** Preserve cell types, errors, leading zeros and original Excel row numbers. */
export async function parseWorkbook(buffer: ArrayBuffer, baseOnly = true): Promise<WorkSheetData[]> {
  const bytes = new Uint8Array(buffer);
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b) && !(bytes[0] === 0xd0 && bytes[1] === 0xcf))
    throw new Error("El contenido no corresponde a un libro Excel válido. Abre el archivo en Excel y guárdalo como .xlsx.");
  const metadata = XLSX.read(buffer, { type: "array", bookSheets: true });
  const baseName = baseOnly ? findBaseSheet(metadata.SheetNames) : null;
  const wb = XLSX.read(buffer, {
    ...(baseName ? { sheets: [baseName] } : {}),
    type: "array", dense: false, cellDates: false, bookVBA: false,
    cellFormula: true, sheetStubs: false, cellStyles: false,
  });
  if (baseName) return readSonacol(wb, baseName);
  const sheets: WorkSheetData[] = [];
  let cells = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const populatedRows = new Map<number, unknown[]>();
    // !ref may span A1:XFD1048576 solely because of formatting. Walk stored
    // cells, never that rectangle. Column positions remain the original indices.
    for (const address in ws) {
      if (!Object.prototype.hasOwnProperty.call(ws, address) || !/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address)) continue;
      const cell = ws[address] as XLSX.CellObject;
      if (!hasCellContent(cell)) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      if (r > 1048575 || c > 16383) throw new Error(`La hoja “${name}” contiene una dirección de celda inválida: ${address}.`);
      if (++cells > MAX_CONTENT_CELLS)
        throw new Error("El libro supera 2.000.000 de celdas con contenido. El formato vacío no cuenta para este límite.");
      let row = populatedRows.get(r);
      if (!row) { row = []; populatedRows.set(r, row); }
      row[c] = { t: cell.t, v: cell.v, w: cell.w, f: cell.f, date1904: !!wb.Workbook?.WBProps?.date1904 };
    }
    if (populatedRows.size) {
      const positions = [...populatedRows.keys()].sort((a, b) => a - b);
      sheets.push({ name, rows: positions.map((r) => populatedRows.get(r)!), rowNumbers: positions.map((r) => r + 1) });
    }
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
    if (sheet.prepared) {
      sheetResults.push({name:sheet.name,headerIndex:sheet.headerIndex??1,columns:[],dataRows:override.skip?0:sheet.prepared.length,entityType:sheet.prepared[0]?.entityType??"unknown",profile:sheet.profile,note:sheet.note});
      if (!override.skip) for (const input of sheet.prepared) {
        const record={...input};
        if(record.status!=="ERROR") {
          if(seen.has(record.dedupeKey)) {record.status="DUPLICATE";record.warnings="Fila idéntica a otra del archivo.";}
          else seen.add(record.dedupeKey);
        }
        records.push(record);
      }
      if(records.length>MAX_IMPORT_ROWS) throw new Error("El libro supera 20.000 registros financieros. Las filas auxiliares no cuentan para este límite.");
      continue;
    }
    const detected = analyzeSheet(sheet.name, sheet.rows);
    const rowNumbers = sheet.rowNumbers ?? sheet.rows.map((_, i) => i + 1);
    const headerIndex = override.headerIndex ?? (detected ? rowNumbers[detected.headerIndex - 1] : rowNumbers[0]) ?? 1;
    const header = sheet.rows[rowNumbers.indexOf(headerIndex)] ?? [];
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
    for (let i = 0; i < sheet.rows.length; i++) {
      if (rowNumbers[i] <= headerIndex) continue;
      const row = sheet.rows[i];
      if (!Object.values(row).some(hasCellContent)) continue;
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
      const raw = Object.fromEntries(Object.entries(row).map(([index, v]) => {
        const c = Number(index);
        return [`${cellText(header[c]) || `Columna ${c + 1}`} [${c + 1}]`, cellText(v)];
      }));
      records.push({ sheet: sheet.name, row: rowNumbers[i], status, entityType, normalized: n, raw,
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
