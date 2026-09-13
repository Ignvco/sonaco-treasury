import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { useCurrency } from "@/contexts/currency-context";
import { agingBuckets, customerName, receivablesSummary } from "@/financial-engine/calculations";
import { INVOICE_STATUS_LABEL, type Invoice } from "@/financial-engine/types";
import { daysUntil, formatDateMedium, todayISO } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Receivables() {
  const { data: invoices, loading, error } = useAsyncData(() => dataService.getInvoices(), []);
  const { data: customers } = useAsyncData(() => dataService.getCustomers(), []);
  const { money } = useCurrency();

  const summary = useMemo(() => (invoices ? receivablesSummary(invoices, todayISO()) : null), [invoices]);
  const aging = useMemo(() => (invoices ? agingBuckets(invoices, todayISO()) : []), [invoices]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!invoices || !summary || !customers) return <EmptyState />;

  const nameOf = (id: string) => customerName(customers, id);

  const exportRows = invoices
    .filter((i) => i.status !== "pagado")
    .map((i) => ({
      Cliente: nameOf(i.customerId),
      Documento: i.document,
      "Fecha emisión": formatDateMedium(i.issueDate),
      "Fecha vencimiento": formatDateMedium(i.dueDate),
      Monto: i.amount,
      "Días vencidos": Math.max(0, -daysUntil(i.dueDate)),
      Estado: INVOICE_STATUS_LABEL[i.status],
    }));

  const agingChartData = aging.map((a) => ({ name: a.bucket, amount: a.amount }));

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Cuentas por Cobrar"
        subtitle="Cartera de clientes — estado y antigüedad de saldos"
        actions={<ExportMenu rows={exportRows} filename="cuentas-por-cobrar" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total por cobrar" value={summary.total} subtext="Cartera abierta" icon={undefined} />
        <KpiCard label="Vencido" value={summary.overdue} subtext="Saldos vencidos" tone={summary.overdue > 0 ? "danger" : "success"} />
        <KpiCard label="Por vencer" value={summary.upcoming} subtext="Vence después de 7 días" />
        <KpiCard label="Vence esta semana" value={summary.dueSoon} subtext="Próximos 7 días" tone="warning" />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <SectionCard title="Aging de Cartera" subtitle="Antigüedad de saldos vencidos" className="col-span-12 lg:col-span-5" bodyClassName="px-2 pb-3">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#F0F0F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8B8B8B" }} tickLine={false} axisLine={{ stroke: "#F0F0F0" }} />
              <YAxis tick={{ fontSize: 10, fill: "#8B8B8B" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v === 0 ? "0" : `${v / 1000}k`)} width={38} />
              <Tooltip
                cursor={{ fill: "rgba(3,32,165,0.06)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-[#EAEAEA] bg-card px-3 py-2 shadow-soft">
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
                      <p className="t-num text-[12px] font-semibold text-foreground">{money(payload[0].value as number)}</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="amount" fill="#0320A5" radius={[6, 6, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Detalle de Cartera" subtitle="Documentos abiertos por cliente" className="col-span-12 lg:col-span-7" bodyClassName="pt-2">
          <DataTable<Invoice>
            data={invoices.filter((i) => i.status !== "pagado")}
            rowKey={(i) => i.id}
            search
            searchText={(i) => `${nameOf(i.customerId)} ${i.document} ${INVOICE_STATUS_LABEL[i.status]}`}
            pageSize={7}
            defaultSort={{ key: "dueDate", dir: "asc" }}
            columns={[
              {
                key: "customer",
                header: "Cliente",
                sortValue: (i) => nameOf(i.customerId),
                render: (i) => (
                  <div className="max-w-[170px]">
                    <p className="truncate text-[13px] font-medium">{nameOf(i.customerId)}</p>
                    <p className="t-num text-[11px] text-muted-foreground">{i.document}</p>
                  </div>
                ),
              },
              { key: "due", header: "Vencimiento", sortValue: (i) => i.dueDate, render: (i) => <span className="text-muted-foreground">{formatDateMedium(i.dueDate)}</span> },
              { key: "amount", header: "Monto", align: "right", sortValue: (i) => i.amount, render: (i) => <span className="t-num font-semibold">{money(i.amount)}</span> },
              {
                key: "days",
                header: "Días vencidos",
                align: "right",
                hideBelow: "md",
                sortValue: (i) => -daysUntil(i.dueDate),
                render: (i) => {
                  const d = -daysUntil(i.dueDate);
                  return (
                    <span className={cn("t-num text-[12px] font-semibold", d > 0 ? "text-danger" : d === 0 ? "text-warning" : "text-success")}>
                      {d > 0 ? d : "—"}
                    </span>
                  );
                },
              },
              { key: "status", header: "Estado", align: "center", render: (i) => <StatusBadge label={INVOICE_STATUS_LABEL[i.status]} /> },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
