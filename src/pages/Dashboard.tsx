import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ChevronRight,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { KpiCard } from "@/components/treasury/KpiCard";
import { SectionCard } from "@/components/treasury/SectionCard";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { DataTable } from "@/components/treasury/DataTable";
import { DateRangePicker } from "@/components/treasury/DateRangePicker";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { ChartTooltip, PeriodToggle } from "@/components/treasury/charts";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { useCurrency } from "@/contexts/currency-context";
import {
  CASHFLOW_CATEGORY_LABEL,
  CASHFLOW_STATUS_LABEL,
  CASHFLOW_TYPE_LABEL,
  type CashFlow,
} from "@/financial-engine/types";
import { formatDateMedium, formatDateShort, formatMoney, toISODate } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

type ChartMode = "daily" | "weekly" | "monthly";



const DEFAULT_PERIOD = { from: toISODate(0), to: toISODate(30) };

export default function Dashboard() {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const { data, loading, error } = useAsyncData(
    () => dataService.getDashboard(period.from, period.to),
    [period.from, period.to],
  );
  const { money } = useCurrency();
  const [mode, setMode] = useState<ChartMode>("daily");

  const bankName = useMemo(() => {
    const map = new Map<string, string>();
    data?.positions.forEach((p) => map.set(p.bank.id, p.bank.name));
    return map;
  }, [data]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState />;

  const { kpis, positions, movements, receivables, upcomingPayments, deficit } = data;

  const chartData =
    mode === "daily"
      ? data.projection
      : mode === "weekly"
        ? data.projectionWeekly
        : data.projectionMonthly;

  const chartLabel = (v: string) => {
    if (mode === "monthly") {
      const [y, m] = v.split("-");
      const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      return `${months[Number(m) - 1]} ${y}`;
    }
    return formatDateShort(v);
  };

  const maxAvailable = Math.max(...positions.map((p) => p.available), 1);

  const movementRows = movements.map((m) => ({
    Movimiento: m.description,
    Fecha: formatDateMedium(m.date),
    Cuenta: bankName.get(m.bankId) ?? "—",
    Tipo: CASHFLOW_TYPE_LABEL[m.type],
    Monto: m.type === "income" ? `+${formatMoney(m.amount, m.currency)}` : `-${formatMoney(m.amount, m.currency)}`,
    Estado: CASHFLOW_STATUS_LABEL[m.status],
  }));

  const exportRows = [
    {
      Métrica: "Caja disponible",
      Valor: kpis.availableCash,
    },
    {
      Métrica: "Caja proyectada",
      Valor: kpis.projectedCash,
    },
    {
      Métrica: "Cobros esperados",
      Valor: kpis.expectedCollections,
    },
    {
      Métrica: "Pagos esperados",
      Valor: kpis.expectedPayments,
    },
    {
      Métrica: "Liquidez neta",
      Valor: kpis.netLiquidity,
    },
    ...movementRows.map((r) => ({ Métrica: r.Movimiento, Valor: r.Monto })),
  ];

  return (
    <div className="t-fade-in flex flex-col gap-5">
      {/* Greeting + actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-foreground md:text-[32px]">
            Resumen de tesorería
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Resumen de posición financiera y liquidez
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={period} onChange={setPeriod} />
          <ExportMenu rows={exportRows} filename="resumen-tesoreria" label="Exportar" />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <KpiCard
          label="Caja Disponible"
          value={kpis.availableCash}
          subtext="Saldo disponible consolidado"
          icon={Wallet}
        />
        <KpiCard
          label="Caja Proyectada"
          value={kpis.projectedCash}
          subtext="Cierre del período"
          icon={TrendingUp}
          tone={kpis.projectedCash < 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Cobros Esperados"
          value={kpis.expectedCollections}
          subtext="Próximos cobros"
          icon={ArrowDownToLine}
        />
        <KpiCard
          label="Pagos Esperados"
          value={kpis.expectedPayments}
          subtext="Próximos pagos"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <KpiCard
          label="Liquidez Neta"
          value={kpis.netLiquidity}
          subtext="Caja + inversiones − obligaciones"
          icon={PiggyBank}
        />
      </div>

      {/* Central zone */}
      <div className="grid grid-cols-12 gap-5">
        <SectionCard
          title="Flujo de Caja"
          subtitle="Ingresos, egresos y saldo proyectado"
          action={
            <PeriodToggle<ChartMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "daily", label: "Diario" },
                { value: "weekly", label: "Semanal" },
                { value: "monthly", label: "Mensual" },
              ]}
            />
          }
          className="col-span-12 xl:col-span-8"
          bodyClassName="px-2 pb-3"
        >
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#F0F0F0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={chartLabel}
                  tick={{ fontSize: 10, fill: "#8B8B8B" }}
                  tickLine={false}
                  axisLine={{ stroke: "#F0F0F0" }}
                  interval={mode === "daily" ? 4 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#8B8B8B" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v === 0 ? "0" : Math.abs(v) >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`
                  }
                  width={42}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(3,32,165,0.06)" }} />
                <Bar isAnimationActive={false} dataKey="income" fill="#0320A5" radius={[5, 5, 0, 0]} maxBarSize={22} />
                <Bar isAnimationActive={false} dataKey="expense" fill="#FF9400" fillOpacity={0.85} radius={[5, 5, 0, 0]} maxBarSize={22} />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="final"
                  stroke="#0320A5"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Right column: bank position + deficit */}
        <div className="col-span-12 flex flex-col gap-5 xl:col-span-4">
          <SectionCard title="Posición Bancaria" subtitle="Disponible por banco" bodyClassName="flex flex-col gap-4">
            <div className="flex flex-col gap-3.5">
              {positions.map((p) => (
                <div key={p.bank.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {p.bank.name}
                    </span>
                    <span className="t-num shrink-0 text-[13px] font-semibold text-foreground">
                      {money(p.available)}
                    </span>
                  </div>
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(6, (p.available / maxAvailable) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/banks"
              className="mt-auto inline-flex items-center gap-1 pt-2 text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark"
            >
              Ver todos los bancos
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </SectionCard>

          {/* Deficit alert */}
          <div className="t-card t-card-hover flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl",
                  deficit ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                )}
              >
                <TrendingDown className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {deficit ? "Próximo déficit de caja" : "Sin déficit proyectado"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {deficit ? "Saldo mínimo del período" : "Posición sana en el horizonte"}
                </p>
              </div>
            </div>
            {deficit ? (
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    {formatDateMedium(deficit.date)}
                  </p>
                  <p className="t-kpi-value !text-[22px] text-danger">
                    {money(deficit.amount)}
                  </p>
                </div>
                <Link
                  to="/cashflow"
                  className="rounded-xl bg-brand px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                  Revisar flujo
                </Link>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                El saldo proyectado se mantiene positivo durante los próximos 30 días.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom zone */}
      <div className="grid grid-cols-12 gap-5">
        <SectionCard
          title="Historial de Movimientos"
          subtitle="Últimos movimientos conciliados"
          className="col-span-12 xl:col-span-8"
          action={
            <Link
              to="/cashflow"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-dark"
            >
              Ver todo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <DataTable<CashFlow>
            data={movements}
            rowKey={(m) => m.id}
            pageSize={6}
            defaultSort={{ key: "date", dir: "desc" }}
            columns={[
              {
                key: "description",
                header: "Movimiento",
                sortValue: (m) => m.description,
                render: (m) => (
                  <div className="max-w-[220px]">
                    <p className="truncate text-[13px] font-medium text-foreground">{m.description}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {CASHFLOW_CATEGORY_LABEL[m.category]}
                    </p>
                  </div>
                ),
              },
              {
                key: "date",
                header: "Fecha",
                sortValue: (m) => m.date,
                render: (m) => <span className="text-[13px] text-muted-foreground">{formatDateMedium(m.date)}</span>,
              },
              {
                key: "bank",
                header: "Cuenta",
                hideBelow: "md",
                render: (m) => <span className="text-[13px]">{bankName.get(m.bankId) ?? "—"}</span>,
              },
              {
                key: "type",
                header: "Tipo",
                hideBelow: "md",
                render: (m) => (
                  <StatusBadge
                    label={CASHFLOW_TYPE_LABEL[m.type]}
                    tone={m.type === "income" ? "success" : "warning"}
                    dot={false}
                  />
                ),
              },
              {
                key: "amount",
                header: "Monto original",
                align: "right",
                sortValue: (m) => m.amount,
                render: (m) => (
                  <span className={cn("t-num text-[13px] font-semibold", m.type === "income" ? "text-success" : "text-danger")}>
                    {m.type === "income" ? "+" : "-"}
                    {formatMoney(m.amount, m.currency)}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Estado",
                align: "center",
                render: (m) => <StatusBadge label={CASHFLOW_STATUS_LABEL[m.status]} />,
              },
            ]}
          />
        </SectionCard>

        <div className="col-span-12 flex flex-col gap-5 xl:col-span-4">
          {/* Receivables */}
          <SectionCard
            title="Cuentas por Cobrar"
            subtitle="Cartera abierta"
            action={
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
                <Banknote className="h-4 w-4" strokeWidth={1.8} />
              </span>
            }
          >
            <div className="mb-4">
              <p className="t-label mb-1">Total por cobrar</p>
              <p className="t-kpi-value !text-[24px]">{money(receivables.total)}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <MiniStat label="Vencido" value={money(receivables.overdue)} tone="danger" />
              <MiniStat label="Por vencer" value={money(receivables.upcoming + receivables.dueSoon)} tone="success" />
              <MiniStat label="Próximo vencimiento" value={money(receivables.dueSoon)} tone="warning" />
            </div>
            <Link
              to="/receivables"
              className="mt-4 inline-flex items-center gap-1 pt-1 text-[12px] font-semibold text-brand hover:text-brand-dark"
            >
              Ver cartera <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </SectionCard>

          {/* Upcoming payments */}
          <SectionCard title="Próximos Pagos" subtitle="Pagos programados" bodyClassName="px-0 pb-2">
            <div className="flex flex-col">
              {upcomingPayments.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-[#F1F1F1] px-5 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{p.supplier}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateMedium(p.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="t-num text-[13px] font-semibold text-foreground">{money(p.amount)}</span>
                    <StatusBadge label={CASHFLOW_STATUS_LABEL[p.status]} />
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/payments"
              className="mt-3 inline-flex items-center gap-1 px-5 text-[12px] font-semibold text-brand hover:text-brand-dark"
            >
              Ver todos los pagos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
  const dot = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </span>
      <span className="t-num text-[13px] font-semibold text-foreground">{value}</span>
    </div>
  );
}
