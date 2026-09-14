import { useState } from "react";
import { Check, Download, Settings2, Table2 } from "lucide-react";
import { DataTable } from "@/components/treasury/DataTable";
import { SectionCard } from "@/components/treasury/SectionCard";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import type { ImportOverrides, ImportPreview as Preview, ProcessedRecord } from "@/import-engine/types";
import type { ImportEntityType } from "@/financial-engine/types";
import { formatMoney } from "@/financial-engine/format";
import { downloadFile, toCSV } from "@/lib/export";

const ENTITIES: Record<string, string> = { cash_flow: "Movimientos", invoice: "Facturas", customer: "Clientes", investment: "Inversiones", projection: "Proyecciones", reconciliation: "Conciliación (revisión manual)", unknown: "Sin clasificar" };
const FIELDS: Record<string, string> = { date: "Fecha", amount: "Monto", type: "Ingreso / egreso", description: "Descripción", bank: "Banco", account: "Cuenta", currency: "Moneda", amountDebe: "Debe (ingreso contable)", amountHaber: "Haber (egreso contable)", charge: "Cargo bancario (egreso)", credit: "Abono bancario (ingreso)", document: "Documento", customer: "Cliente", rut: "RUT", issueDate: "Fecha de emisión", dueDate: "Vencimiento", startDate: "Inicio inversión", endDate: "Término inversión", rate: "Tasa", interest: "Interés", status: "Estado" };
const LABELS: Record<string, string> = { VALID: "Listo", WARNING: "Revisar", ERROR: "No se importará", DUPLICATE: "Duplicado" };

export function ImportPreview({ preview, applied, busy, onAnalyze, onConfirm, onDiscard }: {
  preview: Preview; applied: ImportOverrides; busy: boolean;
  onAnalyze: (overrides: ImportOverrides) => void; onConfirm: () => void; onDiscard: () => void;
}) {
  const [draft, setDraft] = useState<ImportOverrides>(applied);
  const [sheetName, setSheetName] = useState(preview.sheets[0]?.name ?? "");
  const [filter, setFilter] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const sheet = preview.sheets.find((s) => s.name === sheetName) ?? preview.sheets[0];
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const change = (value: ImportOverrides[string]) => { setDraft((old) => ({ ...old, [sheet.name]: { ...old[sheet.name], ...value } })); setReviewed(false); };
  const selected = draft[sheet?.name] ?? {};
  const rows = preview.records.filter((r) => (!sheetName || r.sheet === sheetName) && (!filter || r.status === filter));
  return <section className="space-y-5" aria-label="Vista previa de importación">
    <SectionCard title="Revisa los datos antes de importar" subtitle={preview.fileName} action={<span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">Paso 2 de 3</span>}>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[ ["Listos", preview.valid, "text-success"], ["Con advertencias", preview.warning, "text-amber-700"], ["Con errores", preview.error, "text-danger"], ["Duplicados", preview.duplicate, "text-muted-foreground"] ].map(([label, count, tone]) => <div key={label} className="rounded-xl border bg-muted/40 px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{count}</p></div>)}
      </div>
      {preview.total === 0 && <p role="alert" className="mb-4 rounded-xl bg-warning-soft p-4 text-sm text-amber-900">No se encontraron filas de datos. Revisa la fila de encabezados y las hojas seleccionadas.</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium">Hoja del archivo<select className="t-input w-full min-w-0" value={sheetName} onChange={(e) => setSheetName(e.target.value)}>{preview.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.dataRows} filas</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-medium">Mostrar<select className="t-input" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos los registros</option>{Object.entries(LABELS).map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
        <button className="t-button-secondary" onClick={() => downloadFile(toCSV(preview.records.filter((r) => r.status !== "VALID").map((r) => ({ Hoja: r.sheet, Fila: r.row, Estado: LABELS[r.status], Detalle: r.warnings }))), "revision-importacion.csv", "text/csv;charset=utf-8")}><Download size={15} /> Descargar revisión</button>
      </div>
      {sheet && <details className="my-4 rounded-xl border bg-slate-50/70 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Settings2 size={16} /> Ajustar hoja y columnas <span className="ml-auto text-xs font-normal text-muted-foreground">{ENTITIES[sheet.entityType]}</span></summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Si la detección no coincide con tu archivo, indica dónde están los encabezados y qué representa cada columna. Debe/Haber usa la convención contable; Cargo/Abono usa la cartola bancaria.</p>
        <div className="my-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs">Destino<select className="t-input" value={selected.entityType ?? sheet.entityType} onChange={(e) => change({ entityType: e.target.value as ImportEntityType })}>{Object.entries(ENTITIES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="grid gap-1 text-xs">Fila de encabezados<input type="number" min={1} max={1048576} className="t-input" value={selected.headerIndex ?? sheet.headerIndex} onChange={(e) => change({ headerIndex: Math.max(1, Number(e.target.value)), mapping: {} })} /></label>
          <label className="grid gap-1 text-xs">Formato de números escritos como texto<select className="t-input" value={selected.numberLocale ?? "es-CL"} onChange={(e) => change({ numberLocale: e.target.value as "es-CL" | "en-US" })}><option value="es-CL">Chile: 1.234,56</option><option value="en-US">EE. UU.: 1,234.56</option></select></label>
          <label className="flex items-center gap-2 self-end py-2 text-sm"><input type="checkbox" checked={!!selected.skip} onChange={(e) => change({ skip: e.target.checked })} /> Omitir esta hoja</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(FIELDS).map(([key, text]) => <label key={key} className="grid gap-1 text-xs">{text}<select className="t-input w-full min-w-0" disabled={!!selected.skip} value={selected.mapping?.[key] ?? sheet.columns.find((c) => c.key === key)?.index ?? -1} onChange={(e) => change({ mapping: { ...selected.mapping, [key]: Number(e.target.value) } })}><option value={-1}>Sin asignar</option>{sheet.headers?.map((h, index) => <option key={index} value={index}>{index + 1}. {h || "Sin encabezado"}</option>)}</select></label>)}</div>
        <button disabled={!dirty || busy} className="t-button-secondary mt-4" onClick={() => onAnalyze(draft)}><Table2 size={15} /> Aplicar y volver a analizar</button>
      </details>}
      {dirty && <p role="alert" className="mb-4 rounded-xl bg-warning-soft p-3 text-sm text-amber-900">Hay cambios de configuración pendientes. Aplica los cambios para actualizar la vista previa.</p>}
      <DataTable<ProcessedRecord> data={rows} rowKey={(r) => `${r.sheet}-${r.row}`} pageSize={6} search searchText={(r) => `${r.row} ${r.normalized.description} ${r.normalized.customer} ${r.warnings}`} columns={[
        { key: "row", header: "Fila", render: (r) => r.row },
        { key: "detail", header: "Descripción / cliente", className: "!whitespace-normal min-w-[170px] max-w-[280px]", render: (r) => String(r.normalized.description || r.normalized.customer || r.normalized.document || "—") },
        { key: "date", header: "Fecha", render: (r) => String(r.normalized.date || r.normalized.issueDate || r.normalized.startDate || "—") },
        { key: "type", header: "Tipo", render: (r) => r.entityType === "cash_flow" || r.entityType === "projection" ? (r.normalized.type === "expense" ? "Egreso" : "Ingreso") : ENTITIES[r.entityType] },
        { key: "amount", header: "Monto original", align: "right", render: (r) => typeof r.normalized.amount === "number" ? formatMoney(r.normalized.amount, r.normalized.currency as "CLP") : "—" },
        { key: "status", header: "Estado", render: (r) => <StatusBadge label={LABELS[r.status]} tone={r.status === "VALID" ? "success" : r.status === "ERROR" ? "danger" : r.status === "WARNING" ? "warning" : "muted"} /> },
        { key: "warnings", header: "Detalle", className: "!whitespace-normal min-w-[230px] max-w-[340px]", render: (r) => <span className="text-xs text-muted-foreground">{r.warnings || "Validación correcta"}</span> },
      ]} />
      {(preview.warning > 0 || preview.error > 0 || preview.duplicate > 0) && <label className="mt-5 flex items-start gap-2 rounded-xl bg-muted/70 p-4 text-sm"><input className="mt-1" type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /><span>Revisé las advertencias. Se importarán las filas listas y las que tienen advertencias; los errores y duplicados quedarán fuera.</span></label>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">La validación final y la detección de duplicados se confirman al guardar.</p>
        <div className="flex gap-2"><button className="t-button-secondary" disabled={busy} onClick={onDiscard}>Descartar</button><button className="t-button-primary" disabled={busy || dirty || preview.valid + preview.warning === 0 || ((preview.warning + preview.error + preview.duplicate) > 0 && !reviewed)} onClick={onConfirm}><Check size={16} /> Importar {preview.valid + preview.warning} filas</button></div>
      </div>
    </SectionCard>
  </section>;
}
