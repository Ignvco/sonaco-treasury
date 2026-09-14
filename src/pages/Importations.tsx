import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Files, Loader2, ShieldCheck, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { importService, type ImportProgress } from "@/services/importService";
import { ImportPreview } from "./importations/ImportPreview";
import type { ImportOverrides, ImportPreview as Preview } from "@/import-engine/types";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge, type StatusTone } from "@/components/treasury/StatusBadge";
import { FilterBar, FilterSelect } from "@/components/treasury/FilterBar";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { toCSV, downloadFile } from "@/lib/export";
import { IMPORT_RECORD_STATUS_LABEL, type ImportBatch, type ImportRecord } from "@/financial-engine/types";
import { formatDateMedium } from "@/financial-engine/format";
import { cn } from "@/lib/utils";
import { useCanWrite } from "@/contexts/auth-context";

const ENTITY_LABEL: Record<string, string> = { customer: "Cliente", invoice: "Factura", cash_flow: "Movimiento", investment: "Inversión", projection: "Proyección", reconciliation: "Conciliación", unknown: "Sin clasificar" };
const STATUS_TONE: Record<string, StatusTone> = { VALID: "success", WARNING: "warning", ERROR: "danger", DUPLICATE: "muted" };
const BATCH_STATUS: Record<string, { label: string; tone: StatusTone }> = { completed: { label: "Completado", tone: "success" }, partial: { label: "Con errores", tone: "warning" }, failed: { label: "Sin importar", tone: "danger" }, processing: { label: "Procesando", tone: "info" } };

export default function Importations() {
  const canWrite = useCanWrite();
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [overrides, setOverrides] = useState<ImportOverrides>({});
  const [selected, setSelected] = useState<ImportBatch | null>(null), [statusFilter, setStatusFilter] = useState("");
  const [failure, setFailure] = useState("");
  const input = useRef<HTMLInputElement>(null), currentFile = useRef<File | null>(null), abort = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const { data: batches, loading, error } = useAsyncData(() => importService.getBatches(), [refresh]);
  useEffect(() => () => abort.current?.abort(), []);
  const analyze = async (file: File, choices: ImportOverrides = {}) => {
    if (inFlight.current || !canWrite) return;
    inFlight.current = true; setBusy(true); setFailure("");
    abort.current = new AbortController();
    setProgress({ phase: `Leyendo ${file.name}…`, done: 0, total: 0 });
    try {
      const result = await importService.analyzeFile(file, setProgress, choices, abort.current.signal);
      currentFile.current = file; setPreview(result); setOverrides(choices);
    } catch (err) { setFailure(err instanceof Error ? err.message : "No se pudo leer el archivo."); }
    finally { inFlight.current = false; setBusy(false); setProgress(null); }
  };
  const choose = (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length > 1) { setFailure("Selecciona un archivo a la vez para revisar sus datos antes de importar."); return; }
    setPreview(null); void analyze(files[0]);
  };
  const confirm = async (applyRows:number[]) => {
    if (!preview || inFlight.current || !canWrite) return;
    inFlight.current = true; setBusy(true); setFailure(""); abort.current = null;
    try {
      const batch = await importService.commitImport(preview, setProgress, applyRows);
      setSelected(batch); setStatusFilter("");
      if (batch.status === "completed") toast.success("Importación confirmada", { description: `${batch.importedRecords ?? 0} filas guardadas · ${batch.duplicateRecords} sin cambios u omitidas.` });
      else toast.warning("Revisa el resultado de la importación", { description: `${batch.importedRecords ?? 0} filas guardadas · ${batch.errorRecords} errores.` });
      setPreview(null); currentFile.current = null; setRefresh((r) => r + 1);
    } catch (err) { setFailure(err instanceof Error ? err.message : "No se pudo guardar. Revisa el historial antes de reintentar."); setRefresh((r) => r + 1); }
    finally { inFlight.current = false; setBusy(false); setProgress(null); }
  };
  const items = batches ?? [];
  return <div className="t-fade-in flex min-w-0 flex-col gap-6">
    <PageHeader title="Importaciones" subtitle="Carga exclusiva de la hoja BASE · BASE-ONLY-20260914-v2" />
    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground" aria-label="Pasos de importación">{["Selecciona tu archivo", "Revisa y valida", "Confirma la importación"].map((step, i) => <div key={step} className="flex items-center gap-3"><span className={cn("flex h-7 w-7 items-center justify-center rounded-full border", (preview ? i === 1 : i === 0) && "border-brand bg-brand text-white")}>{i + 1}</span><span>{step}</span>{i < 2 && <ArrowRight size={14} className="hidden sm:block" />}</div>)}</div>
    {failure && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger"><p>{failure}</p><button aria-label="Cerrar mensaje" onClick={() => setFailure("")}><X size={17} /></button></div>}
    {canWrite && !preview && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,1fr)]">
      <div data-testid="excel-dropzone" onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) choose(e.dataTransfer.files); }} className={cn("group flex min-h-[286px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-brand/20 bg-white p-7 text-center transition-colors", dragging && "border-brand bg-brand-soft")}>
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-brand-soft text-brand"><UploadCloud size={30} strokeWidth={1.6} /></span>
        <h2 className="text-xl font-semibold tracking-tight">Arrastra tu Excel hasta aquí</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Leeremos únicamente BASE, con sus montos y fechas.<br className="hidden sm:block" /> Podrás comprobar todo antes de guardar.</p>
        <button disabled={busy} className="t-button-primary mt-5" onClick={() => input.current?.click()}><FileSpreadsheet size={16} /> Seleccionar archivo</button>
        <input ref={input} aria-label="Seleccionar archivo Excel" type="file" accept=".xlsx,.xlsm,.xls" className="sr-only" disabled={busy} onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
        <p className="mt-3 text-xs text-muted-foreground">XLSX, XLSM y XLS · Hasta 20 MB y 20.000 filas</p>
      </div>
      <aside className="rounded-[22px] border border-brand/10 bg-[#edf1ff] p-6"><div className="mb-5 flex items-center gap-2 text-brand"><ShieldCheck size={19} /><h2 className="text-sm font-semibold">Cada dato, con su origen</h2></div><div className="space-y-5">{[["Solo BASE", "Clasifica los registros consolidados de BASE por su origen."], ["Revisa antes de guardar", "Comprueba los valores de BASE y las observaciones antes de confirmar."], ["Conserva la trazabilidad", "Consulta el archivo, la hoja y la fila de cada registro."]].map(([title, detail]) => <div className="flex gap-3" key={title}><CheckCircle2 className="mt-0.5 shrink-0 text-brand/70" size={16} /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{detail}</p></div></div>)}</div></aside>
    </div>}
    {!canWrite && <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Puedes consultar el historial. Para importar necesitas el rol Tesorería o Administrador.</div>}
    {busy && progress && <div role="status" aria-live="polite" className="flex items-center gap-4 rounded-2xl border border-brand/20 bg-brand-soft p-5"><Loader2 className="shrink-0 animate-spin text-brand" size={22} /><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{progress.phase}</p><p className="mt-1 text-xs text-muted-foreground">{abort.current ? "El archivo se analiza en tu dispositivo." : "Espera la confirmación antes de cerrar esta página."}</p></div>{abort.current && <button className="t-button-secondary" onClick={() => abort.current?.abort()}>Cancelar</button>}</div>}
    {preview && <ImportPreview key={preview.fileHash + preview.comparison?.revision} preview={preview} applied={overrides} busy={busy} onAnalyze={(o) => currentFile.current && void analyze(currentFile.current, o)} onConfirm={(rows) => void confirm(rows)} onDiscard={() => { setPreview(null); currentFile.current = null; }} />}
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <KpiCard label="Archivos recientes" value={items.length} subtext="Últimas 30 importaciones" plain icon={Files} />
      <KpiCard label="Filas analizadas" value={items.reduce((a, b) => a + b.totalRecords, 0)} subtext="En el historial reciente" plain />
      <KpiCard label="Filas guardadas" value={items.reduce((a, b) => a + (b.importedRecords ?? 0), 0)} subtext="Confirmadas en esta versión" plain tone="success" />
      <KpiCard label="Filas con errores" value={items.reduce((a, b) => a + b.errorRecords, 0)} subtext="Consulta el detalle para corregir" plain tone={items.some((b) => b.errorRecords) ? "danger" : "default"} />
    </div>
    <SectionCard title="Historial de importaciones" subtitle="Selecciona un archivo para consultar el resultado y sus registros." action={<button className="t-button-secondary" onClick={() => setRefresh((r) => r + 1)}>Actualizar</button>}>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => setRefresh((r) => r + 1)} /> : <DataTable<ImportBatch> data={items} rowKey={(b) => b.id} search searchText={(b) => b.fileName} pageSize={6} onRowClick={(b) => { setSelected(b); setStatusFilter(""); }} columns={[
        { key: "file", header: "Archivo", sortValue: (b) => b.fileName, render: (b) => <span className="flex items-center gap-2 font-medium"><FileSpreadsheet size={16} className="text-brand" />{b.fileName}</span> },
        { key: "date", header: "Fecha", sortValue: (b) => b.createdAt, render: (b) => formatDateMedium(b.createdAt) },
        { key: "total", header: "Analizadas", align: "right", render: (b) => b.totalRecords },
        { key: "saved", header: "Guardadas", align: "right", render: (b) => <span className="font-semibold text-success">{b.importedRecords ?? "Sin verificar"}</span> },
        { key: "error", header: "Errores", align: "right", render: (b) => <span className={b.errorRecords ? "text-danger" : "text-muted-foreground"}>{b.errorRecords}</span> },
        { key: "duplicates", header: "Duplicados", align: "right", render: (b) => b.duplicateRecords },
        { key: "status", header: "Estado", render: (b) => <StatusBadge {...(BATCH_STATUS[b.status] ?? { label: b.status, tone: "muted" })} /> },
      ]} />}
    </SectionCard>
    {selected && <BatchRecords key={selected.id} batch={selected} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />}
  </div>;
}
function BatchRecords({
  batch,
  statusFilter,
  setStatusFilter,
}: {
  batch: ImportBatch;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
}) {
  const { data: records, loading, error } = useAsyncData(
    () => importService.getBatchRecords(batch.id),
    [batch.id],
  );

  const filtered = useMemo(
    () => (records ?? []).filter((r) => !statusFilter || r.status === statusFilter),
    [records, statusFilter],
  );

  const exportRows = (filtered).map((r) => ({
    Hoja: r.sourceSheet ?? "",
    Fila: r.sourceRow ?? "",
    Estado: IMPORT_RECORD_STATUS_LABEL[r.status],
    Entidad: ENTITY_LABEL[r.entityType] ?? r.entityType,
    Mensaje: r.warnings,
  }));

  return (
    <SectionCard
      title={`Detalle — ${batch.fileName}`}
      subtitle="Trazabilidad: cada registro conserva su origen (hoja y fila del archivo)"
      action={
        <button
          onClick={() => {
            downloadFile(toCSV(exportRows), `importacion-${batch.fileName.replace(/\.[^.]+$/, "")}.csv`, "text/csv;charset=utf-8");
            toast.success("Reporte exportado");
          }}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Download className="h-3.5 w-3.5" />
          Reporte
        </button>
      }
      bodyClassName="pt-2"
    >
      <FilterBar>
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Todos los estados"
          options={Object.entries(IMPORT_RECORD_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))}
        />
      </FilterBar>

      {error ? <ErrorState message={error} /> : loading ? (
        <LoadingState label="Cargando registros…" />
      ) : !records || records.length === 0 ? (
        <EmptyState title="Sin registros" description="Este archivo no generó filas procesables." />
      ) : (
        <DataTable<ImportRecord>
          data={filtered}
          rowKey={(r) => r.id}
          pageSize={12}
          columns={[
            { key: "row", header: "Fila", align: "right", sortValue: (r) => r.sourceRow ?? 0, render: (r) => <span className="t-num text-muted-foreground">{r.sourceRow ?? "—"}</span> },
            { key: "sheet", header: "Hoja", sortValue: (r) => r.sourceSheet ?? "", render: (r) => <span className="text-muted-foreground">{r.sourceSheet ?? "—"}</span> },
            {
              key: "entity",
              header: "Entidad",
              sortValue: (r) => ENTITY_LABEL[r.entityType] ?? r.entityType,
              render: (r) => <span className="font-medium">{ENTITY_LABEL[r.entityType] ?? r.entityType}</span>,
            },
            {
              key: "status",
              header: "Estado",
              align: "center",
              sortValue: (r) => r.status,
              render: (r) => (
                <StatusBadge label={IMPORT_RECORD_STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status] ?? "info"} />
              ),
            },
            {
              key: "warnings",
              header: "Mensaje",
              render: (r) => (
                <span className={cn("text-[12px]", r.warnings ? "text-muted-foreground" : "text-success")}>
                  {r.warnings || "Registro válido"}
                </span>
              ),
            },
          ]}
        />
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        La trazabilidad conserva el archivo, la hoja y la fila de origen. Los estados corresponden al resultado confirmado en la base de datos.
      </p>
    </SectionCard>
  );
}
