import { useMemo } from "react";
import { Link } from "react-router-dom";
import { GitCompareArrows } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { KpiCard } from "@/components/treasury/KpiCard";
import { BankCard } from "@/components/treasury/BankCard";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { useCurrency } from "@/contexts/currency-context";
import type { BankPosition } from "@/financial-engine/calculations";

export default function Banks() {
  const { data, loading, error } = useAsyncData(() => dataService.getBankPositions(), []);
  const { money } = useCurrency();

  const summary = useMemo(() => {
    if (!data) return null;
    return {
      contable: data.reduce((a, p) => a + p.available, 0),
      conciliado: data.reduce((a, p) => a + p.reconciled, 0),
      invertido: data.reduce((a, p) => a + p.invested, 0),
      enRevision: data.filter((p) => p.status === "revisar").length,
    };
  }, [data]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data || !summary) return <EmptyState />;

  const exportRows = data.map((p) => ({
    Banco: p.bank.name,
    Cuenta: p.account?.accountNumber ?? "—",
    "Saldo contable": p.available,
    "Saldo conciliado": p.reconciled,
    Diferencia: p.difference,
    Invertido: p.invested,
    Estado: p.status === "revisar" ? "Revisar" : "OK",
  }));

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Bancos"
        subtitle="Cuadratura de saldos, conciliación y posición por banco"
        actions={
          <>
            <Link
              to="/reconciliation"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#EAEAEA] bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand"
            >
              <GitCompareArrows className="h-4 w-4" />
              Conciliación
            </Link>
            <ExportMenu rows={exportRows} filename="posicion-bancaria" />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo contable" value={summary.contable} subtext="Consolidado" icon={undefined} />
        <KpiCard label="Saldo conciliado" value={summary.conciliado} subtext="Según cartola" />
        <KpiCard label="Total invertido" value={summary.invertido} subtext="Colocaciones + FM" />
        <KpiCard
          label="En revisión"
          value={summary.enRevision}
          subtext={summary.enRevision > 0 ? "Bancos con diferencias" : "Sin diferencias"}
          tone={summary.enRevision > 0 ? "warning" : "success"}
          plain
          icon={undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.map((position: BankPosition) => (
          <BankCard key={position.bank.id} position={position} />
        ))}
      </div>

      <p className="text-[12px] text-muted-foreground">
        Saldo proyectado disponible:{" "}
        <span className="t-num font-semibold text-foreground">{money(summary.contable)}</span> · Última
        conciliación registrada por cuenta. Preparado para integración bancaria futura.
      </p>
    </div>
  );
}
