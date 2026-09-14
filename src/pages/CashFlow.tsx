import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { FilterBar, FilterSelect } from "@/components/treasury/FilterBar";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { ChartTooltip, PeriodToggle } from "@/components/treasury/charts";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrency } from "@/contexts/currency-context";
import { useCanWrite } from "@/contexts/auth-context";
import {
  CASHFLOW_CATEGORY_LABEL,
  CASHFLOW_STATUS_LABEL,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type CashFlow,
  type CashFlowCategory,
  type CashFlowType,
} from "@/financial-engine/types";
import { formatDateMedium, formatDateShort, formatMoney, todayISO } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

type ChartMode = "daily" | "weekly" | "monthly";

interface Filters {
  from: string;
  to: string;
  bankId: string;
  category: string;
  status: string;
  type: string;
}

const EMPTY_FILTERS: Filters = { from: "", to: "", bankId: "", category: "", status: "", type: "" };

export default function CashFlow() {
  const [refresh, setRefresh] = useState(0);
  const { data: dashboard, error: dashboardError } = useAsyncData(() => dataService.getDashboard(), [refresh]);
  const { data: banks, error: banksError } = useAsyncData(() => dataService.getBanks(), []);
  const [mode, setMode] = useState<ChartMode>("daily");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [open, setOpen] = useState(false);
  const { money } = useCurrency();
  const canWrite = useCanWrite();

  const projection = useMemo(() => {
    if (!dashboard) return [];
    const rows =
      mode === "daily"
        ? dashboard.projection
        : mode === "weekly"
          ? dashboard.projectionWeekly
          : dashboard.projectionMonthly;
    return rows.filter(
      (r) =>
        (!filters.from || r.date >= filters.from) && (!filters.to || r.date <= filters.to),
    );
  }, [dashboard, mode, filters.from, filters.to]);

  const exportRows = projection.map((r) => ({
    Fecha: formatDateMedium(r.date),
    "Saldo inicial": r.initial,
    Ingresos: r.income,
    Egresos: r.expense,
    "Saldo proyectado": r.final,
    Variación: r.variation,
  }));

  if (dashboardError || banksError) return <ErrorState message={dashboardError || banksError} />;
  if (!dashboard) return <LoadingState />;
  if (!banks) return <LoadingState />;

  const kpis = dashboard.kpis;

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Flujo de Caja"
        subtitle="Proyección diaria consolidada — saldo inicial + ingresos − egresos"
        actions={
          <>
            <ExportMenu rows={exportRows} filename="flujo-de-caja" />
            {canWrite && (
              <button
                onClick={() => setOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                <Plus className="h-4 w-4" />
                Registrar movimiento
              </button>
            )}
          </>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo Inicial" value={dashboard.projection[0]?.initial ?? 0} subtext="Posición al inicio del horizonte" icon={undefined} />
        <KpiCard label="Ingresos" value={kpis.expectedCollections} subtext="Próximos 30 días" />
        <KpiCard label="Egresos" value={kpis.expectedPayments} subtext="Próximos 30 días" tone="warning" />
        <KpiCard
          label="Saldo Proyectado"
          value={dashboard.projection[29]?.final ?? 0}
          subtext="Cierre del horizonte"
          tone={dashboard.projection[29]?.final < 0 ? "danger" : "success"}
        />
      </div>

      {/* Chart */}
      <SectionCard
        title="Proyección de Liquidez"
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
        bodyClassName="px-2 pb-3"
      >
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={projection} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#F0F0F0" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => {
                  if (mode === "monthly") {
                    const [, m] = v.split("-");
                    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
                    return months[Number(m) - 1];
                  }
                  return formatDateShort(v);
                }}
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
            <Bar dataKey="income" fill="#0320A5" radius={[5, 5, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" fill="#FF9400" fillOpacity={0.85} radius={[5, 5, 0, 0]} maxBarSize={22} />
            <Line type="monotone" dataKey="final" stroke="#0320A5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Projection table */}
      <SectionCard title="Saldo Proyectado Diario" subtitle="Saldo inicial + ingresos − egresos">
        <FilterBar>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Desde</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className="t-input"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Hasta</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className="t-input"
            />
          </label>
        </FilterBar>
        <DataTable
          data={projection}
          rowKey={(r) => r.date}
          pageSize={10}
          defaultSort={{ key: "date", dir: "asc" }}
          columns={[
            { key: "date", header: "Fecha", sortValue: (r) => r.date, render: (r) => <span className="font-medium">{formatDateMedium(r.date)}</span> },
            { key: "initial", header: "Saldo inicial", align: "right", sortValue: (r) => r.initial, render: (r) => <span className="text-muted-foreground">{money(r.initial)}</span> },
            { key: "income", header: "Ingresos", align: "right", sortValue: (r) => r.income, render: (r) => <span className={r.income === 0 ? "text-muted-foreground/60" : "font-medium text-success"}>{r.income === 0 ? "—" : `+${money(r.income)}`}</span> },
            { key: "expense", header: "Egresos", align: "right", sortValue: (r) => r.expense, render: (r) => <span className={r.expense === 0 ? "text-muted-foreground/60" : "font-medium text-danger"}>{r.expense === 0 ? "—" : `-${money(r.expense)}`}</span> },
            { key: "final", header: "Saldo proyectado", align: "right", sortValue: (r) => r.final, render: (r) => (
              <span className={cn("t-num font-semibold", r.final < 0 ? "text-danger" : "text-foreground")}>{money(r.final)}</span>
            ) },
            { key: "variation", header: "Variación", align: "right", sortValue: (r) => r.variation, render: (r) => (
              <span className={cn("t-num text-[12px] font-semibold", r.variation > 0 ? "text-success" : r.variation < 0 ? "text-danger" : "text-muted-foreground/60")}>
                {r.variation === 0 ? "—" : `${r.variation > 0 ? "+" : ""}${money(r.variation)}`}
              </span>
            ) },
          ]}
        />
      </SectionCard>

      {/* Movements detail */}
      <MovementsDetail
        filters={filters}
        setFilters={setFilters}
        refreshKey={refresh}
        banks={banks.map((b) => ({ value: b.id, label: b.name }))}
      />

      <RegisterMovementDialog
        open={open}
        onOpenChange={setOpen}
        banks={banks}
        onSaved={() => setRefresh((r) => r + 1)}
      />
    </div>
  );
}

function MovementsDetail({
  filters,
  setFilters,
  refreshKey,
  banks,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  refreshKey: number;
  banks: { value: string; label: string }[];
}) {
  const { data: movements, loading, error } = useAsyncData(
    () =>
      dataService.getMovementsFiltered({
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        bankId: filters.bankId || undefined,
        category: (filters.category as CashFlowCategory) || undefined,
        type: (filters.type as CashFlowType) || undefined,
      }),
    [filters.from, filters.to, filters.bankId, filters.category, filters.type, filters.status, refreshKey],
  );

  const categories = Object.entries(CASHFLOW_CATEGORY_LABEL).map(([value, label]) => ({
    value,
    label,
  }));

  const statuses = Object.entries(CASHFLOW_STATUS_LABEL).map(([value, label]) => ({ value, label }));

  return (
    <SectionCard title="Movimientos" subtitle="Importes en su moneda original. Los movimientos ya conciliados no se vuelven a sumar al saldo.">
      <FilterBar>
        <FilterSelect
          value={filters.bankId}
          onChange={(v) => setFilters((f) => ({ ...f, bankId: v }))}
          options={banks}
          placeholder="Todos los bancos"
        />
        <FilterSelect
          value={filters.type}
          onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
          options={[
            { value: "income", label: "Ingresos" },
            { value: "expense", label: "Egresos" },
          ]}
          placeholder="Todos los tipos"
        />
        <FilterSelect
          value={filters.category}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          options={categories}
          placeholder="Todas las categorías"
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={statuses}
          placeholder="Todos los estados"
        />
      </FilterBar>

      {error ? <ErrorState message={error}/> : loading ? (
        <LoadingState label="Filtrando movimientos…" />
      ) : !movements || movements.length === 0 ? (
        <EmptyState title="Sin movimientos" description="No hay registros que coincidan con los filtros." />
      ) : (
        <DataTable<CashFlow>
          data={movements}
          rowKey={(m) => m.id}
          pageSize={10}
          defaultSort={{ key: "date", dir: "desc" }}
          columns={[
            {
              key: "description",
              header: "Descripción",
              sortValue: (m) => m.description,
              render: (m) => (
                <div className="max-w-[240px]">
                  <p className="truncate text-[13px] font-medium">{m.description}</p>
                  <p className="text-[11px] text-muted-foreground">{CASHFLOW_CATEGORY_LABEL[m.category]}</p>
                </div>
              ),
            },
            { key: "date", header: "Fecha", sortValue: (m) => m.date, render: (m) => <span className="text-muted-foreground">{formatDateMedium(m.date)}</span> },
            {
              key: "type",
              header: "Tipo",
              render: (m) => (
                <StatusBadge
                  label={m.type === "income" ? "Ingreso" : "Egreso"}
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
                <span className={cn("t-num font-semibold", m.type === "income" ? "text-success" : "text-danger")}>
                  {m.type === "income" ? "+" : "-"}
                  {formatMoney(m.amount, m.currency)}
                </span>
              ),
            },
            { key: "currency", header: "Moneda", render: (m) => m.currency },
            { key: "status", header: "Estado", align: "center", render: (m) => <StatusBadge label={CASHFLOW_STATUS_LABEL[m.status]} /> },
          ]}
        />
      )}
    </SectionCard>
  );
}

function RegisterMovementDialog({
  open,
  onOpenChange,
  banks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  banks: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const { money } = useCurrency();
  const [type, setType] = useState<CashFlowType>("income");
  const [category, setCategory] = useState<CashFlowCategory>("collection");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState("");
  const [status, setStatus] = useState("proyectado");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("income");
    setCategory("collection");
    setDescription("");
    setAmount("");
    setBankId("");
    setStatus("proyectado");
    setDate(todayISO());
    setError("");
  };

  const handleSave = async () => {
    if (saving) return;
    const value = Number(amount);
    if (!description.trim()) return setError("La descripción es obligatoria.");
    if (!Number.isFinite(value) || value <= 0) return setError("Ingresa un monto válido mayor a cero.");
    if (!date) return setError("La fecha es obligatoria.");
    setSaving(true);
    try {
      await dataService.addCashFlowEntry({
        date,
        type,
        category,
        description: description.trim(),
        amount: value,
        currency: "CLP",
        bankId: bankId || "",
        status: status as CashFlow["status"],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el movimiento.");
      return;
    } finally { setSaving(false); }
    toast.success("Movimiento registrado", {
      description: `${description.trim()} · ${money(value)}`,
    });
    onSaved?.();
    onOpenChange(false);
    reset();
  };

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">Registrar movimiento</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            {(["income", "expense"] as CashFlowType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setType(t);
                  setCategory(t === "income" ? "collection" : "supplier");
                }}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  type === t
                    ? t === "income"
                      ? "border-brand bg-brand-soft text-brand-dark"
                      : "border-danger/40 bg-danger-soft text-danger"
                    : "border-[#EAEAEA] bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "income" ? "Ingreso" : "Egreso"}
              </button>
            ))}
          </div>

          <Field label="Categoría">
            <select value={category} onChange={(e) => setCategory(e.target.value as CashFlowCategory)} className="t-input w-full cursor-pointer">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CASHFLOW_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Descripción">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Cobro cliente — F-1055"
              className="t-input w-full"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Monto (CLP)">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="t-input w-full"
              />
            </Field>
            <Field label="Fecha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="t-input w-full" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Banco">
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="t-input w-full cursor-pointer">
                <option value="">Seleccionar…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="t-input w-full cursor-pointer">
                {["proyectado", "confirmado", "programado", "pendiente", "borrador"].map((s) => (
                  <option key={s} value={s}>
                    {CASHFLOW_STATUS_LABEL[s as CashFlow["status"]]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-[#EAEAEA] px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={saving} onClick={handleSave}
              className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Guardar movimiento
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
