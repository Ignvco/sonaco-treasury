import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  Database,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Plug,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { importService } from "@/services/importService";
import { createERPConnector } from "@/services/erp/erp-connector";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge, type StatusTone } from "@/components/treasury/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import type { SyncHistory, SyncSource } from "@/financial-engine/types";
import { formatDateMedium } from "@/financial-engine/format";
import { cn } from "@/lib/utils";
import { useCanWrite } from "@/contexts/auth-context";

const SYNC_TONE: Record<string, StatusTone> = {
  Success: "success",
  Connected: "success",
  Warning: "warning",
  Syncing: "info",
  Error: "danger",
};

const SOURCE_LABEL: Record<string, string> = {
  erp: "ERP",
  excel: "Excel",
  banks: "Bancos",
};

export default function Integrations() {
  const canWrite = useCanWrite();
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: sources, loading, error } = useAsyncData(
    () => importService.getSyncSources(),
    [refresh],
  );
  const { data: history } = useAsyncData(() => importService.getSyncHistory(), [refresh]);

  const erpConnector = createERPConnector();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!sources) return <EmptyState />;

  const src = (s: string): SyncSource | undefined =>
    (sources as SyncSource[]).find((x) => x.source === s);

  const runSync = async (source: "erp" | "excel" | "banks") => {
    if (!canWrite) return;
    setSyncing(source);
    try {
      await importService.runSync(source);
      toast.success("Sincronización completada", { description: `Origen ${SOURCE_LABEL[source]}` });
    } catch (err) {
      toast.error("Sincronización no disponible", {
        description: err instanceof Error ? err.message : "Fuente sin configurar",
      });
    } finally {
      setSyncing(null);
      setRefresh((r) => r + 1);
    }
  };

  const syncRows = (history ?? []).map((h) => ({
    ...h,
    durationText: `${h.durationSeconds}s`,
  }));

  const exportRows = (history ?? []).map((h) => ({
    Fecha: formatDateMedium(h.syncedAt),
    Origen: SOURCE_LABEL[h.source] ?? h.source,
    Registros: h.records,
    Duración: `${h.durationSeconds}s`,
    Estado: h.status,
    Errores: h.errorMessage ?? "",
  }));

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Centro de Integraciones"
        subtitle="Fuentes de datos: ERP, Excel histórico y bancos"
        actions={
          canWrite && (
            <Link
              to="/importations"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Nueva importación
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* ERP */}
        <IntegrationCard
          icon={ServerCog}
          name="ERP Corporativo"
          state={src("erp")}
          tone="danger"
          description="Fuente de datos contables reales"
          statusLabel={src("erp")?.enabled ? "Conectado" : "No configurado"}
          footer={
            <div className="flex flex-col gap-1.5">
              {erpConnector.capabilities.slice(0, 4).map((c) => (
                <div key={c.operation} className="flex items-center justify-between text-[11.5px]">
                  <span className="font-mono text-muted-foreground">{c.operation}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                    pendiente
                  </span>
                </div>
              ))}
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Requiere fabricante, versión, conexión y credenciales. Se implementará en un
                connector de backend, nunca desde el navegador.
              </p>
            </div>
          }
          action={
            <button
              disabled={!canWrite || syncing === "erp"}
              onClick={() => runSync("erp")}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
            >
              {syncing === "erp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Sincronizar ahora
            </button>
          }
        />

        {/* Excel */}
        <IntegrationCard
          icon={FileSpreadsheet}
          name="Excel histórico"
          state={src("excel")}
          tone="success"
          description="Importador ETL de archivos .xlsx / .xlsm"
          statusLabel="Conectado"
          stats={[
            { label: "Registros procesados", value: String(src("excel")?.recordsSynced ?? 0) },
            { label: "Errores", value: String(src("excel")?.errors ?? 0) },
          ]}
          action={
            <div className="flex gap-2">
              <Link
                to="/importations"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Importar
              </Link>
              <button
                disabled={!canWrite || syncing === "excel"}
                onClick={() => runSync("excel")}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50"
              >
                {syncing === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sincronizar
              </button>
            </div>
          }
        />

        {/* Banks */}
        <IntegrationCard
          icon={Landmark}
          name="Integración bancaria"
          state={src("banks")}
          tone="warning"
          description="Cuadraturas y conciliación automática"
          statusLabel="Preparada"
          footer={
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Arquitectura lista para conectar servicios bancarios (carteras, abonos, saldos). La
              implementación requiere el proveedor y sus credenciales.
            </p>
          }
          action={
            <button
              disabled={!canWrite || syncing === "banks"}
              onClick={() => runSync("banks")}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-warning/50 hover:text-warning disabled:opacity-50"
            >
              {syncing === "banks" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Sincronizar ahora
            </button>
          }
        />
      </div>

      {/* Architecture */}
      <div className="t-card flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <Database className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Arquitectura de datos</p>
            <p className="text-[11px] text-muted-foreground">Fuentes → Normalización → Base de datos → Motor financiero → App</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
          {["Excel histórico", "ERP (futuro)"].map((srcName, i) => (
            <span key={srcName} className="flex items-center gap-2">
              {i > 0 && <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="rounded-xl border border-[#EAEAEA] bg-card px-3 py-1.5">{srcName}</span>
            </span>
          ))}
          <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="rounded-xl bg-brand-soft px-3 py-1.5 text-brand-dark">Data Platform</span>
          <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="rounded-xl bg-brand-soft px-3 py-1.5 text-brand-dark">Treasury Engine</span>
          <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="rounded-xl bg-brand px-3 py-1.5 text-white">SONACOL Treasury</span>
        </div>
      </div>

      {/* Sync history */}
      <SectionCard
        title="Historial de Sincronizaciones"
        subtitle="Origen, registros, duración y estado de cada sincronización"
        bodyClassName="pt-2"
      >
        <DataTable
          data={syncRows}
          rowKey={(h) => h.id}
          pageSize={8}
          columns={[
            { key: "date", header: "Fecha", sortValue: (h) => h.syncedAt, render: (h) => <span className="text-muted-foreground">{formatDateMedium(h.syncedAt)}</span> },
            { key: "source", header: "Origen", sortValue: (h) => h.source, render: (h) => <span className="font-medium">{SOURCE_LABEL[h.source] ?? h.source}</span> },
            { key: "records", header: "Registros", align: "right", sortValue: (h) => h.records, render: (h) => <span className="t-num">{h.records.toLocaleString("es-CL")}</span> },
            { key: "duration", header: "Duración", align: "right", render: (h) => <span className="t-num text-muted-foreground">{h.durationText}</span> },
            { key: "status", header: "Estado", align: "center", render: (h) => <StatusBadge label={h.status} tone={SYNC_TONE[h.status] ?? "info"} /> },
            { key: "errors", header: "Errores", render: (h) => <span className={cn("text-[12px]", h.errorMessage ? "text-danger" : "text-success")}>{h.errorMessage || "—"}</span> },
          ]}
        />
      </SectionCard>

      {/* Source of truth */}
      <div className="t-card flex flex-col gap-2 p-5">
        <p className="text-[13px] font-semibold text-foreground">Fuente de verdad</p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">ERP</span> = datos contables reales (cuando
          exista integración) · <span className="font-semibold text-foreground">Tesorería</span> =
          proyecciones y gestión · <span className="font-semibold text-foreground">Excel</span> =
          fuente histórica / legacy. El Excel no será una dependencia operacional futura.
        </p>
      </div>
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  name,
  state,
  tone,
  description,
  statusLabel,
  stats,
  footer,
  action,
}: {
  icon: typeof Landmark;
  name: string;
  state?: SyncSource;
  tone: "success" | "warning" | "danger";
  description: string;
  statusLabel: string;
  stats?: { label: string; value: string }[];
  footer?: React.ReactNode;
  action: React.ReactNode;
}) {
  const lastSync = state?.lastSyncAt;
  const iconTone = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];

  return (
    <div className="t-card t-card-hover flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", iconTone)}>
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-foreground">{name}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <StatusBadge
          label={statusLabel}
          tone={state?.enabled ? "success" : tone === "danger" ? "muted" : tone}
        />
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-[#EAEAEA] px-3 py-2">
              <p className="t-label">{s.label}</p>
              <p className="t-num text-[15px] font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {lastSync && (
        <p className="text-[11px] text-muted-foreground">
          Última sincronización: <span className="font-semibold text-foreground">{formatDateMedium(lastSync)}</span>
        </p>
      )}

      {footer}
      <div className="mt-auto pt-1">{action}</div>
    </div>
  );
}
