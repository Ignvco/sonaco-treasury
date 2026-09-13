import { useState } from "react";
import { FileCheck2, X } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrency } from "@/contexts/currency-context";
import { formatDateMedium } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

interface ReconciliationRow {
  id: string;
  bankName: string;
  accountNumber: string;
  accountingBalance: number;
  bankBalance: number;
  difference: number;
  status: string;
  reconciledAt: string;
}

export default function Reconciliation() {
  const { data, loading, error } = useAsyncData(() => dataService.getReconciliations(), []);
  const { money } = useCurrency();
  const [selected, setSelected] = useState<ReconciliationRow | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState />;

  const exportRows = data.map((r) => ({
    Banco: r.bankName,
    Cuenta: r.accountNumber,
    "Saldo contable": r.accountingBalance,
    "Saldo bancario": r.bankBalance,
    Diferencia: r.difference,
    "Última conciliación": formatDateMedium(r.reconciledAt),
    Estado: r.status === "revisar" ? "Revisar" : "OK",
  }));

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Conciliación"
        subtitle="Saldos contables vs. saldos bancarios por cuenta"
        actions={<ExportMenu rows={exportRows} filename="conciliacion-bancaria" />}
      />

      <SectionCard title="Cuentas bancarias" subtitle="Haz clic en una fila para ver el detalle" bodyClassName="pt-2">
        <DataTable<ReconciliationRow>
          data={data}
          rowKey={(r) => r.id}
          search
          searchText={(r) => `${r.bankName} ${r.accountNumber} ${r.status}`}
          pageSize={8}
          onRowClick={setSelected}
          columns={[
            { key: "bank", header: "Banco", sortValue: (r) => r.bankName, render: (r) => <span className="font-medium">{r.bankName}</span> },
            { key: "account", header: "Cuenta", render: (r) => <span className="t-num text-muted-foreground">{r.accountNumber}</span> },
            { key: "accounting", header: "Saldo contable", align: "right", sortValue: (r) => r.accountingBalance, render: (r) => <span className="t-num">{money(r.accountingBalance)}</span> },
            { key: "bankBalance", header: "Saldo bancario", align: "right", sortValue: (r) => r.bankBalance, render: (r) => <span className="t-num">{money(r.bankBalance)}</span> },
            {
              key: "difference",
              header: "Diferencia",
              align: "right",
              sortValue: (r) => r.difference,
              render: (r) => (
                <span className={cn("t-num font-semibold", r.difference === 0 ? "text-success" : "text-warning")}>
                  {r.difference === 0 ? "$0" : money(r.difference)}
                </span>
              ),
            },
            { key: "date", header: "Última conciliación", hideBelow: "md", sortValue: (r) => r.reconciledAt, render: (r) => <span className="text-muted-foreground">{formatDateMedium(r.reconciledAt)}</span> },
            { key: "status", header: "Estado", align: "center", render: (r) => <StatusBadge label={r.status === "revisar" ? "Revisar" : "OK"} /> },
          ]}
        />
      </SectionCard>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-[#EAEAEA] pb-4">
            <SheetTitle className="flex items-center gap-2 text-[16px]">
              <FileCheck2 className="h-4 w-4 text-brand" />
              Conciliación — {selected?.bankName}
            </SheetTitle>
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </SheetHeader>

          {selected && (
            <div className="flex flex-col gap-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <DetailBox label="Saldo contable" value={money(selected.accountingBalance)} />
                <DetailBox label="Saldo bancario" value={money(selected.bankBalance)} />
                <DetailBox
                  label="Diferencia"
                  value={selected.difference === 0 ? "$0" : money(selected.difference)}
                  tone={selected.difference === 0 ? "success" : "warning"}
                />
                <DetailBox label="Cuenta" value={selected.accountNumber} />
              </div>

              <div>
                <p className="t-label mb-2">Última conciliación</p>
                <p className="text-[13px] font-medium text-foreground">{formatDateMedium(selected.reconciledAt)}</p>
              </div>

              <div>
                <p className="t-label mb-2">Movimientos contables</p>
                <div className="flex flex-col gap-1.5">
                  {selected.difference === 0 ? (
                    <p className="text-[12px] text-success">Saldos cuadrados. Sin partidas pendientes.</p>
                  ) : (
                    <>
                      <MovementLine label="Cheque pendiente de cobro" amount={-selected.difference} />
                      <MovementLine label="Comisión bancaria no contabilizada" amount={selected.difference * 0.4} />
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="t-label mb-2">Movimientos bancarios</p>
                <div className="flex flex-col gap-1.5">
                  {selected.difference === 0 ? (
                    <p className="text-[12px] text-muted-foreground">Sin partidas conciliatorias.</p>
                  ) : (
                    <MovementLine label="Nota de débito en tránsito" amount={selected.difference} />
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {selected.difference === 0
                    ? "Cuadre confirmado. Esta cuenta está lista para flujo."
                    : `Existe una diferencia de ${money(Math.abs(selected.difference))}. Revisar partidas en tránsito antes de cerrar el mes.`}
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-card p-3.5">
      <p className="t-label mb-1">{label}</p>
      <p
        className={cn(
          "t-num text-[15px] font-semibold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MovementLine({ label, amount }: { label: string; amount: number }) {
  const { money } = useCurrency();
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#EAEAEA] px-3 py-2">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("t-num text-[12px] font-semibold", amount < 0 ? "text-danger" : "text-success")}>
        {amount > 0 ? "+" : ""}
        {money(Math.abs(amount))}
      </span>
    </div>
  );
}
