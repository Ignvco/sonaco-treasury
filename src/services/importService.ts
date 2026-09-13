/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { ImportBatch, ImportRecord, ImportRecordStatus, SyncSource, SyncHistory } from "@/financial-engine/types";
import { MAX_FILE_BYTES, type ImportSummary } from "@/import-engine/types";
import type { ImportOverrides, ImportPreview } from "@/import-engine/types";

const db = supabase as any;
export interface ImportProgress { phase: string; done: number; total: number; }

const toImportBatch = (r: any): ImportBatch => ({
  id: r.id, fileName: r.file_name, source: r.source, uploadedBy: r.uploaded_by,
  status: r.status, totalRecords: r.total_records, validRecords: r.valid_records,
  warningRecords: r.warning_records, errorRecords: r.error_records,
  duplicateRecords: r.duplicate_records, createdAt: r.created_at, importedRecords: r.imported_records ?? null,
});
const toImportRecord = (r: any): ImportRecord => ({
  id: r.id, importBatchId: r.import_batch_id, sourceSheet: r.source_sheet, sourceRow: r.source_row,
  status: r.status as ImportRecordStatus, entityType: r.entity_type, entityId: r.entity_id,
  raw: r.raw_json ?? {}, normalized: r.normalized_json ?? {}, warnings: r.warnings ?? "", createdAt: r.created_at,
});
function message(error: { code?: string; message?: string }): string {
  if (error.code === "PGRST202" || error.code === "42883") return "Falta actualizar la base de datos del proyecto. Aplica la migración de importación incluida en esta versión y vuelve a intentar.";
  if (error.code === "42501") return "Tu sesión o rol no permite esta operación. Inicia sesión con permisos de Tesorería o Administrador.";
  return error.message || "No se pudo completar la operación. Revisa tu conexión.";
}

/** All worker outcomes release memory, including file read failures, cancellation and timeout. */
export async function analyzeFile(file: File, onProgress?: (p: ImportProgress) => void, overrides: ImportOverrides = {}, signal?: AbortSignal): Promise<ImportPreview> {
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo .xlsx, .xlsm o .xls.");
  if (!file.size) throw new Error("El archivo está vacío.");
  if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera 20 MB. Divide el libro e inténtalo nuevamente.");
  if (signal?.aborted) throw new Error("Análisis cancelado.");
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const originalHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const effective = new TextEncoder().encode(originalHash + JSON.stringify(overrides));
  const fileHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", effective)), (b) => b.toString(16).padStart(2, "0")).join("");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/xlsx.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { worker.terminate(); clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const fail = (reason: string) => { cleanup(); reject(new Error(reason)); };
    const abort = () => fail("Análisis cancelado.");
    const timer = setTimeout(() => fail("El análisis superó dos minutos. Divide el libro o elimina filas vacías con formato."), 120000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data);
      else if (data.type === "done") { cleanup(); resolve({ ...(data.summary as ImportSummary), fileHash }); }
      else fail(data.message || "No se pudo analizar el archivo.");
    };
    worker.onerror = (event) => fail(event.message || "No se pudo iniciar el lector Excel. Recarga la aplicación.");
    worker.onmessageerror = () => fail("No se pudo leer el resultado del archivo.");
    worker.postMessage({ file: buffer, name: file.name, overrides }, [buffer]);
  });
}

export const importService = {
  analyzeFile,
  async commitImport(preview: ImportPreview, onProgress?: (p: ImportProgress) => void): Promise<ImportBatch> {
    if (!preview.total || preview.valid + preview.warning === 0) throw new Error("No hay filas válidas para importar. Revisa el mapeo y los errores.");
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session.session) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    onProgress?.({ phase: "Guardando registros y trazabilidad…", done: 0, total: 0 });
    const { data, error } = await db.rpc("import_treasury_records", {
      p_file_name: preview.fileName, p_file_hash: preview.fileHash, p_records: preview.records,
    });
    // Never retry through another write path: an interrupted response may already have committed.
    if (error) throw new Error(message(error));
    if (!data?.id || !["completed", "partial", "failed"].includes(data.status)) throw new Error("No se recibió confirmación. Revisa el historial antes de volver a importar.");
    onProgress?.({ phase: "Importación verificada", done: 1, total: 1 });
    return toImportBatch(data);
  },
  async runFileImport(file: File, onProgress?: (p: ImportProgress) => void): Promise<ImportBatch> {
    return this.commitImport(await analyzeFile(file, onProgress), onProgress);
  },
  async getBatches(): Promise<ImportBatch[]> {
    const { data, error } = await db.from("import_batches").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) throw new Error(message(error));
    return (data ?? []).map(toImportBatch);
  },
  async getBatchRecords(batchId: string): Promise<ImportRecord[]> {
    const result: ImportRecord[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from("import_records").select("*").eq("import_batch_id", batchId)
        .order("source_sheet").order("source_row").order("id").range(offset, offset + 499);
      if (error) throw new Error(message(error));
      result.push(...(data ?? []).map(toImportRecord));
      if (!data || data.length < 500) return result;
    }
  },
  async getSyncSources(): Promise<SyncSource[]> {
    const { data, error } = await db.from("sync_sources").select("*").order("created_at");
    if (error) throw new Error(message(error));
    return (data ?? []).map((r: any) => ({ id: r.id, source: r.source, name: r.name, status: r.status, enabled: r.enabled, lastSyncAt: r.last_sync_at, recordsSynced: r.records_synced, errors: r.errors }));
  },
  async getSyncHistory(): Promise<SyncHistory[]> {
    const { data, error } = await db.from("sync_history").select("*").order("synced_at", { ascending: false }).limit(30);
    if (error) throw new Error(message(error));
    return (data ?? []).map((r: any) => ({ id: r.id, source: r.source, records: r.records, durationSeconds: Number(r.duration_seconds), status: r.status, errorMessage: r.error_message, syncedAt: r.synced_at }));
  },
  async runSync(source: "erp" | "excel" | "banks"): Promise<void> {
    throw new Error(source === "excel" ? "Ve a Importaciones y selecciona un archivo para actualizar tus datos." : "Esta integración todavía no tiene un conector configurado. No se sincronizaron registros.");
  },
};
