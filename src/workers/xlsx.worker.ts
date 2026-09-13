/// <reference lib="webworker" />
/* ============================================================
 * Web Worker — parsea y procesa el workbook fuera del hilo
 * principal para que la interfaz nunca se congele.
 * ============================================================ */

import { parseWorkbook, processWorkbook } from "@/import-engine/pipeline";
import type { ImportSummary, ImportOverrides } from "@/import-engine/types";

const ctx = self as unknown as Worker;

interface ImportMessage {
  file: ArrayBuffer;
  name: string;
  overrides?: ImportOverrides;
}

ctx.onmessage = async (e: MessageEvent<ImportMessage>) => {
  const { file, name, overrides } = e.data;
  try {
    const sheets = await parseWorkbook(file);
    if (sheets.length === 0) {
      ctx.postMessage({ type: "error", message: "El archivo no contiene hojas con datos." });
      return;
    }
    ctx.postMessage({
      type: "progress",
      done: 0,
      total: sheets.length,
      phase: `Analizando ${sheets.length} hojas…`,
    });
    const summary: ImportSummary = processWorkbook(sheets, (done, total, phase) => {
      ctx.postMessage({ type: "progress", done, total, phase });
    }, overrides);
    summary.fileName = name;
    ctx.postMessage({ type: "done", summary });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "No se pudo analizar el archivo.",
    });
  }
};
