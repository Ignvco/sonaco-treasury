import { useEffect, useMemo, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarClock, MoreHorizontal, RefreshCw } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import {
  INVESTMENT_STATUS_LABEL,
  INVESTMENT_TYPE_LABEL,
  type Investment,
} from "@/financial-engine/types";
import { daysUntil, formatDateMedium, formatDateShort } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Investments() {
  const { data: investments, loading, error } = useAsyncData(() => dataService.getInvestments(), []);
  const { data: banks } = useAsyncData(() => dataService.getBanks(), []);
  const { data: dashboard } = useAsyncData(() => dataService.getDashboard(), []);
  const { money } = useCurrency();
  const [items, setItems] = useState<Investment[]>([]);
  const [selected, setSelected] = useState<Investment | null>(null);
  const [rescueTarget, setRescueTarget] = useState<Investment | null>(null);

  // Keep the editable portfolio in sync with the loaded seed data
  useEffect(() => {
    if (investments) setItems(investments);
  }, [investments]);

  const bankName = useMemo(() => {
    const map = new Map<string, string>();
    banks?.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [banks]);

  const summary = useMemo(() => {
    const active = items.filter((i) => i.status !== "rescatada");
    const dueSoon = items.filter((i) => {
      const d = daysUntil(i.endDate);
      return i.status !== "rescatada" && d >= 0 && d <= 30;
    });
    return {
      total: active.reduce((a, i) => a + i.amount, 0),
      dueSoonAmount: dueSoon.reduce((a, i) => a + i.amount, 0),
      dueSoonCount: dueSoon.length,
      unknownInterest: active.filter((i) => i.rateKnown === false).length,
      interest: active.reduce((a, i) => a + i.estimatedInterest, 0),
    };
  }, [items]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!investments || !summary || !banks) return <EmptyState />;

  const exportRows = items.map((i) => ({
    Tipo: INVESTMENT_TYPE_LABEL[i.type],
    Banco: bankName.get(i.bankId) ?? "—",
    Monto: i.amount,
    Inicio: formatDateMedium(i.startDate),
    Término: formatDateMedium(i.endDate),
    "Días restantes": Math.max(0, daysUntil(i.endDate)),
    Tasa: i.rateKnown === false ? "No informada" : `${i.rate}%`,
    "Interés estimado": i.rateKnown === false ? "No informado" : i.estimatedInterest,
    Estado: INVESTMENT_STATUS_LABEL[i.status],
  }));

  const schedule = items.filter((i) => i.status !== "rescatada");

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Inversiones"
        subtitle="Fondos mutuos y colocaciones — vencimientos y rescates"
        actions={<ExportMenu rows={exportRows} filename="inversiones" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total invertido" value={summary.total} subtext="Colocaciones + fondos mutuos" icon={undefined} />
        <KpiCard
          label="Por vencer (30 días)"
          value={summary.dueSoonAmount}
          subtext={summary.dueSoonCount > 0 ? `${summary.dueSoonCount} inversiones` : "Sin vencimientos próximos"}
          tone={summary.dueSoonCount > 0 ? "warning" : "success"}
        />
        <KpiCard label="Intereses estimados" value={summary.interest} valueText={summary.unknownInterest ? "No disponible" : undefined} subtext={summary.unknownInterest ? `${summary.unknownInterest} inversiones sin tasa informada` : "Al vencimiento"} />
        <KpiCard
          label="Liquidez disponible"
          value={dashboard?.kpis.availableCash ?? 0}
          subtext="Caja en bancos"
        />
      </div>

      {/* Maturity timeline */}
      <SectionCard
        title="Calendario de Vencimientos"
        subtitle="Próximos rescates y vencimientos"
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <CalendarRange className="h-4 w-4" strokeWidth={1.8} />
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {schedule.map((i) => {
            const days = daysUntil(i.endDate);
            const progress = Math.min(100, Math.max(0, 100 - (days / 180) * 100));
            const isSoon = days >= 0 && days <= 30;
            return (
              <div key={i.id} className="flex items-center gap-4">
                <div className="w-[130px] shrink-0">
                  <p className="truncate text-[12px] font-semibold text-foreground">{INVESTMENT_TYPE_LABEL[i.type]}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateShort(i.endDate)}</p>
                </div>
                <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", isSoon ? "bg-warning" : i.status === "rescate_programado" ? "bg-info" : "bg-brand")}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="w-[150px] shrink-0 text-right">
                  <p className="t-num text-[13px] font-semibold text-foreground">{money(i.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {i.status === "rescatada" ? "Rescatada" : days >= 0 ? `${days} días restantes` : "Vencida"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Portafolio" subtitle="Detalle de inversiones vigentes" bodyClassName="pt-2">
        <DataTable<Investment>
          data={items}
          rowKey={(i) => i.id}
          search
          searchText={(i) => `${INVESTMENT_TYPE_LABEL[i.type]} ${bankName.get(i.bankId) ?? ""} ${INVESTMENT_STATUS_LABEL[i.status]}`}
          pageSize={10}
          defaultSort={{ key: "endDate", dir: "asc" }}
          onRowClick={setSelected}
          actions={(i) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setSelected(i)}>Ver detalle</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={i.status === "rescatada"}
                  onClick={() => setRescueTarget(i)}
                >
                  Programar rescate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Editar inversión", { description: INVESTMENT_TYPE_LABEL[i.type] })}>
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={i.status === "rescatada"}
                  onClick={async () => {
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === i.id ? { ...x, status: "rescatada" as const } : x,
                      ),
                    );
                    try {
                      await dataService.updateInvestmentStatus(i.id, "rescatada");
                      toast.success("Inversión marcada como rescatada", {
                        description: INVESTMENT_TYPE_LABEL[i.type],
                      });
                    } catch {
                      toast.error("No se pudo guardar el cambio de estado.");
                    }
                  }}
                >
                  Marcar como rescatada
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          columns={[
            {
              key: "type",
              header: "Tipo",
              sortValue: (i) => INVESTMENT_TYPE_LABEL[i.type],
              render: (i) => (
                <div className="max-w-[140px]">
                  <p className="truncate text-[13px] font-medium">{INVESTMENT_TYPE_LABEL[i.type]}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{bankName.get(i.bankId) ?? "—"}</p>
                </div>
              ),
            },
            { key: "amount", header: "Monto", align: "right", sortValue: (i) => i.amount, render: (i) => <span className="t-num font-semibold">{money(i.amount)}</span> },
            { key: "start", header: "Inicio", hideBelow: "lg", render: (i) => <span className="text-muted-foreground">{formatDateShort(i.startDate)}</span> },
            { key: "end", header: "Término", sortValue: (i) => i.endDate, render: (i) => <span className="text-muted-foreground">{formatDateShort(i.endDate)}</span> },
            {
              key: "days",
              header: "Días restantes",
              align: "right",
              hideBelow: "md",
              sortValue: (i) => daysUntil(i.endDate),
              render: (i) => {
                const d = daysUntil(i.endDate);
                return (
                  <span className={cn("t-num text-[12px] font-semibold", d <= 30 && d >= 0 ? "text-warning" : d < 0 ? "text-muted-foreground" : "text-foreground")}>
                    {i.status === "rescatada" ? "—" : d >= 0 ? d : "Vencida"}
                  </span>
                );
              },
            },
            { key: "rate", header: "Tasa", align: "right", hideBelow: "md", render: (i) => <span className="t-num text-[13px]">{i.rateKnown === false ? "No informada" : `${i.rate.toFixed(1)}%`}</span> },
            { key: "interest", header: "Interés est.", align: "right", hideBelow: "md", render: (i) => <span className="t-num text-[13px] text-muted-foreground">{i.rateKnown === false ? "No informado" : money(i.estimatedInterest)}</span> },
            { key: "status", header: "Estado", align: "center", render: (i) => <StatusBadge label={INVESTMENT_STATUS_LABEL[i.status]} /> },
          ]}
        />
      </SectionCard>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold">Detalle de inversión</DialogTitle>
            <button onClick={() => setSelected(null)} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-brand-soft px-4 py-3">
                <p className="t-label mb-1">{INVESTMENT_TYPE_LABEL[selected.type]}</p>
                <p className="t-kpi-value !text-[24px]">{money(selected.amount)}</p>
                <p className="text-[12px] text-muted-foreground">{bankName.get(selected.bankId)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InvestDetail label="Fecha de inicio" value={formatDateMedium(selected.startDate)} />
                <InvestDetail label="Fecha de término" value={formatDateMedium(selected.endDate)} />
                <InvestDetail label="Tasa anual" value={selected.rateKnown === false ? "No informada" : `${selected.rate.toFixed(1)}%`} />
                <InvestDetail label="Interés estimado" value={selected.rateKnown === false ? "No informado" : money(selected.estimatedInterest)} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#EAEAEA] px-4 py-3">
                <span className="text-[12px] text-muted-foreground">Estado</span>
                <StatusBadge label={INVESTMENT_STATUS_LABEL[selected.status]} />
              </div>
              {selected.status !== "rescatada" && (
                <button
                  onClick={() => {
                    setRescueTarget(selected);
                    setSelected(null);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                  <RefreshCw className="h-4 w-4" />
                  Programar rescate
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rescue dialog */}
      <Dialog open={!!rescueTarget} onOpenChange={(v) => !v && setRescueTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[17px] font-semibold">
              <CalendarClock className="h-4 w-4 text-brand" />
              Programar rescate
            </DialogTitle>
            <button onClick={() => setRescueTarget(null)} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          {rescueTarget && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Programarás el rescate de <span className="font-semibold text-foreground">{money(rescueTarget.amount)}</span> en{" "}
                <span className="font-semibold text-foreground">{bankName.get(rescueTarget.bankId)}</span>, con vencimiento el{" "}
                <span className="font-semibold text-foreground">{formatDateMedium(rescueTarget.endDate)}</span>.
              </p>
              <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  El rescate se reflejará en el flujo de caja como ingreso el día del vencimiento. Revisa la proyección de liquidez antes de confirmar.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRescueTarget(null)} className="rounded-xl border border-[#EAEAEA] px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (rescueTarget) {
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === rescueTarget.id
                            ? { ...x, status: "rescate_programado" as const }
                            : x,
                        ),
                      );
                      try {
                        await dataService.updateInvestmentStatus(rescueTarget.id, "rescate_programado");
                        toast.success("Rescate programado", {
                          description: "La inversión aparece como rescate programado.",
                        });
                      } catch {
                        toast.error("No se pudo programar el rescate.");
                      }
                    }
                    setRescueTarget(null);
                  }}
                  className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-dark"
                >
                  Confirmar rescate
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvestDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#EAEAEA] p-3.5">
      <p className="t-label mb-1">{label}</p>
      <p className="text-[13px] font-semibold text-foreground">{value}</p>
    </div>
  );
}
