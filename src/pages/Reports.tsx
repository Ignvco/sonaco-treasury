import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Eye,
  FileSpreadsheet,
  FileText,
  Landmark,
  PiggyBank,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { downloadFile, toCSV, downloadExcel, type ExportRow } from "@/lib/export";
import { useCurrency } from "@/contexts/currency-context";
import { formatDateMedium, formatDateShort } from "@/financial-engine/format";
import { toast } from "sonner";

export default function Reports() {
  const { data: reportData, loading, error } = useAsyncData(async () => {
    const [dashboard, invoices, customers, investments, reconciliations] = await Promise.all([
      dataService.getDashboard(), dataService.getInvoices(), dataService.getCustomers(), dataService.getInvestments(), dataService.getReconciliations(),
    ]);
    return { dashboard, invoices, customers, investments, reconciliations };
  }, []);
  const { dashboard, invoices, customers, investments, reconciliations } = reportData ?? {};
  const { money } = useCurrency();

  const customersById = useMemo(() => {
    const map = new Map<string, string>();
    customers?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!dashboard || !invoices || !investments || !reconciliations) return <EmptyState />;

  const kpis = dashboard.kpis;

  const datasets: Record<string, { name: string; icon: typeof FileText; description: string; to: string; rows: ExportRow[] }> = {
    cashflow: {
      name: "Flujo de Caja",
      icon: TrendingUp,
      description: "Proyección diaria consolidada de saldos",
      to: "/cashflow",
      rows: dashboard.projection.map((r) => ({
        Fecha: formatDateMedium(r.date),
        "Saldo inicial": r.initial,
        Ingresos: r.income,
        Egresos: r.expense,
        "Saldo proyectado": r.final,
      })),
    },
    liquidity: {
      name: "Liquidez",
      icon: PiggyBank,
      description: "Caja, inversiones y obligaciones proyectadas",
      to: "/dashboard",
      rows: [
        { Métrica: "Caja disponible", Valor: kpis.availableCash },
        { Métrica: "Caja proyectada (30 días)", Valor: kpis.projectedCash },
        { Métrica: "Cobros esperados", Valor: kpis.expectedCollections },
        { Métrica: "Pagos esperados", Valor: kpis.expectedPayments },
        { Métrica: "Inversiones activas", Valor: kpis.investmentsActive },
        { Métrica: "Obligaciones proyectadas", Valor: kpis.obligations },
        { Métrica: "Liquidez neta", Valor: kpis.netLiquidity },
      ],
    },
    banks: {
      name: "Posición Bancaria",
      icon: Landmark,
      description: "Saldos contables, conciliados y diferencias",
      to: "/banks",
      rows: dashboard.positions.map((p) => ({
        Banco: p.bank.name,
        "Saldo contable": p.available,
        "Saldo conciliado": p.reconciled,
        Diferencia: p.difference,
        Invertido: p.invested,
      })),
    },
    receivables: {
      name: "Cuentas por Cobrar",
      icon: ReceiptText,
      description: "Cartera abierta y antigüedad de saldos",
      to: "/receivables",
      rows: invoices
        .filter((i) => i.status !== "pagado")
        .map((i) => ({
          Cliente: customersById.get(i.customerId) ?? "—",
          Documento: i.document,
          Vencimiento: formatDateMedium(i.dueDate),
          Monto: i.amount,
          Estado: i.status,
        })),
    },
    investments: {
      name: "Inversiones",
      icon: BarChart3,
      description: "Portafolio de fondos mutuos y colocaciones",
      to: "/investments",
      rows: investments.map((i) => ({
        Tipo: i.type,
        Monto: i.amount,
        Término: formatDateShort(i.endDate),
        Tasa: `${i.rate}%`,
        Interés: i.estimatedInterest,
        Estado: i.status,
      })),
    },
    reconciliation: {
      name: "Conciliación",
      icon: Wallet,
      description: "Saldos contables vs. bancarios por cuenta",
      to: "/reconciliation",
      rows: reconciliations.map((r) => ({
        Banco: r.bankName,
        Cuenta: r.accountNumber,
        "Saldo contable": r.accountingBalance,
        "Saldo bancario": r.bankBalance,
        Diferencia: r.difference,
      })),
    },
  };

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader title="Reportes" subtitle="Informes de tesorería listos para exportar" />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Object.values(datasets).map((report) => (
          <div key={report.name} className="t-card t-card-hover flex flex-col p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
                <report.icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground">{report.name}</p>
                <p className="text-[12px] text-muted-foreground">{report.description}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-1 flex-col gap-1 rounded-2xl border border-[#EAEAEA] bg-[#FAFAFA] p-3.5">
              <p className="t-label mb-1">Resumen</p>
              {report.rows.slice(0, 3).map((row, idx) => {
                const values = Object.values(row);
                return (
                  <div key={idx} className="flex items-center justify-between text-[12px]">
                    <span className="truncate pr-3 text-muted-foreground">{String(values[0])}</span>
                    <span className="t-num shrink-0 font-semibold text-foreground">
                      {typeof values[values.length - 1] === "number"
                        ? money(values[values.length - 1] as number)
                        : String(values[values.length - 1])}
                    </span>
                  </div>
                );
              })}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {report.rows.length} filas disponibles
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={report.to}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver
              </Link>
              <button
                onClick={async () => {
                  await downloadExcel(report.rows, report.name.toLowerCase().replace(/\s+/g, "-"));
                  toast.success("Excel exportado", { description: report.name });
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-success" />
                Excel
              </button>
              <button
                onClick={() => {
                  toast.info("Exportación PDF", { description: "Se abrirá el diálogo de impresión." });
                  window.print();
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#EAEAEA] bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand"
              >
                <FileText className="h-3.5 w-3.5 text-danger" />
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
