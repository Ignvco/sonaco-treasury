/* ============================================================
 * ETL types — capa de importación Excel → entidades internas.
 * ============================================================ */

import type { ImportEntityType, ImportRecordStatus } from "@/financial-engine/types";

export interface DetectedColumn {
  key: string;
  header: string;
  index: number;
  type: "string" | "date" | "amount" | "id";
}

export interface SheetResult {
  profile?: string;
  note?: string;
  name: string;
  headerIndex: number;
  columns: DetectedColumn[];
  dataRows: number;
  entityType: ImportEntityType;
  headers?: string[];
  sample?: string[][];
}

export interface ProcessedRecord {
  sheet: string;
  row: number; // fila en la hoja (1-based, fila de Excel)
  status: ImportRecordStatus;
  entityType: ImportEntityType;
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
  warnings: string;
  /** Clave de deduplicación */
  dedupeKey: string;
}

export interface ImportSummary {
  fileName: string;
  sheets: SheetResult[];
  total: number;
  valid: number;
  warning: number;
  error: number;
  duplicate: number;
  records: ProcessedRecord[];
}

export type ImportIssue =
  | { kind: "error"; message: string }
  | { kind: "warning"; message: string };

/** Explicit choices override detection, keyed by worksheet name. */
export interface SheetOverride {
  numberLocale?: "es-CL" | "en-US";
  entityType?: ImportEntityType;
  headerIndex?: number;
  mapping?: Record<string, number>;
  skip?: boolean;
}
export type ImportOverrides = Record<string, SheetOverride>;
export interface ImportPreview extends ImportSummary { fileHash: string; }
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20000;
