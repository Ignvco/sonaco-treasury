import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { statusTone } from "@/lib/status-tone";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { useCanWrite } from "@/contexts/auth-context";
import {
  CASHFLOW_CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PROJECTION_STATUS_LABEL,
  type CashFlowCategory,
  type CashFlowType,
  type Projection,
} from "@/financial-engine/types";
import { formatDateMedium, todayISO } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

const PROJECTION_STATUSES: Projection["status"][] = ["borrador", "proyectado", "confirmado", "cancelado"];

export default function Projections() {
  const { data, loading, error } = useAsyncData(() => dataService.getProjections(), []);
  const { data: banks } = useAsyncData(() => dataService.getBanks(), []);
  const { money } = useCurrency();
  const [items, setItems] = useState<Projection[]>([]);
  const [open, setOpen] = useState(false);
  const canWrite = useCanWrite();

  // Sync local editable list once seed data arrives
  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const summary = useMemo(() => {
    const income = items.filter((p) => p.status !== "cancelado" && p.status !== "borrador" && p.type === "income").reduce((a, p) => a + p.amount, 0);
    const expense = items.filter((p) => p.status !== "cancelado" && p.status !== "borrador" && p.type === "expense").reduce((a, p) => a + p.amount, 0);
    return { income, expense, net: income - expense };
  }, [items]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState />;

  const exportRows = items.map((p) => ({
    Fecha: formatDateMedium(p.date),
    Tipo: p.type === "income" ? "Ingreso" : "Egreso",
    Categoría: CASHFLOW_CATEGORY_LABEL[p.category],
    Descripción: p.description,
    Monto: p.amount,
    Estado: PROJECTION_STATUS_LABEL[p.status],
  }));

  const changeStatus = async (id: string, status: Projection["status"]) => {
    try {
      await dataService.updateProjectionStatus(id, status);
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      toast.success("Estado actualizado", { description: PROJECTION_STATUS_LABEL[status] });
    } catch {
      toast.error("No se pudo actualizar el estado de la proyección.");
    }
  };

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Proyecciones"
        subtitle="Registro manual de movimientos proyectados (PROYEC)"
        actions={
          canWrite ? (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              <Plus className="h-4 w-4" />
              Nueva proyección
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Ingresos proyectados" value={summary.income} subtext="Registros de ingreso" />
        <KpiCard label="Egresos proyectados" value={summary.expense} subtext="Registros de egreso" tone="warning" />
        <KpiCard
          label="Neto proyectado"
          value={summary.net}
          subtext="Ingresos − egresos"
          tone={summary.net < 0 ? "danger" : "success"}
        />
      </div>

      <SectionCard title="Registro de Proyecciones" subtitle="Escenarios y movimientos manuales" bodyClassName="pt-2">
        <DataTable<Projection>
          data={items}
          rowKey={(p) => p.id}
          search
          searchText={(p) => `${p.description} ${PROJECTION_STATUS_LABEL[p.status]} ${CASHFLOW_CATEGORY_LABEL[p.category]}`}
          pageSize={10}
          defaultSort={{ key: "date", dir: "asc" }}
          actions={(p) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {PROJECTION_STATUSES.filter((s) => s !== p.status).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => changeStatus(p.id, s)}>
                    Marcar {PROJECTION_STATUS_LABEL[s].toLowerCase()}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await dataService.deleteProjection(p.id);
                      setItems((prev) => prev.filter((x) => x.id !== p.id));
                      toast.info("Proyección eliminada", { description: p.description });
                    } catch {
                      toast.error("No se pudo eliminar la proyección.");
                    }
                  }}
                >
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          columns={[
            { key: "date", header: "Fecha", sortValue: (p) => p.date, render: (p) => <span className="text-muted-foreground">{formatDateMedium(p.date)}</span> },
            {
              key: "description",
              header: "Descripción",
              sortValue: (p) => p.description,
              render: (p) => (
                <div className="max-w-[220px]">
                  <p className="truncate text-[13px] font-medium">{p.description}</p>
                  <p className="text-[11px] text-muted-foreground">{CASHFLOW_CATEGORY_LABEL[p.category]}</p>
                </div>
              ),
            },
            {
              key: "type",
              header: "Tipo",
              hideBelow: "md",
              render: (p) => (
                <StatusBadge label={p.type === "income" ? "Ingreso" : "Egreso"} tone={p.type === "income" ? "success" : "warning"} dot={false} />
              ),
            },
            {
              key: "amount",
              header: "Monto",
              align: "right",
              sortValue: (p) => p.amount,
              render: (p) => (
                <span className={cn("t-num font-semibold", p.type === "income" ? "text-success" : "text-foreground")}>
                  {p.type === "income" ? "+" : "-"}
                  {money(p.amount)}
                </span>
              ),
            },
            { key: "status", header: "Estado", align: "center", render: (p) => <StatusBadge label={PROJECTION_STATUS_LABEL[p.status]} tone={statusTone(p.status)} /> },
          ]}
        />
      </SectionCard>

      {banks && (
        <ProjectionDialog
          open={open}
          onOpenChange={setOpen}
          banks={banks}
          onAdd={async (p) => {
            const saved = await dataService.addProjection(p);
            setItems((prev) => [...prev, saved]);
            toast.success("Proyección agregada", { description: p.description });
          }}
        />
      )}
    </div>
  );
}

function ProjectionDialog({
  open,
  onOpenChange,
  banks,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  banks: { id: string; name: string }[];
  onAdd: (p: Omit<Projection, "id">) => Promise<void>;
}) {
  const { money } = useCurrency();
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<CashFlowType>("income");
  const [category, setCategory] = useState<CashFlowCategory>("collection");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState("");
  const [status, setStatus] = useState<Projection["status"]>("proyectado");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(todayISO());
    setType("income");
    setCategory("collection");
    setDescription("");
    setAmount("");
    setBankId("");
    setStatus("proyectado");
    setError("");
  };

  const handleSave = async () => {
    if (saving) return;
    const value = Number(amount);
    if (!description.trim()) return setError("La descripción es obligatoria.");
    if (!Number.isFinite(value) || value <= 0) return setError("Ingresa un monto válido mayor a cero.");
    setSaving(true);
    try {
    await onAdd({
      date,
      type,
      category,
      amount: value,
      currency: "CLP",
      description: description.trim(),
      status,
      bankId,
    });
    onOpenChange(false);
    reset();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la proyección."); }
    finally { setSaving(false); }
  };

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">Nueva proyección</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted">
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
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Venta de activo fijo" className="t-input w-full" />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Monto (CLP)">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="t-input w-full" />
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
              <select value={status} onChange={(e) => setStatus(e.target.value as Projection["status"])} className="t-input w-full cursor-pointer">
                {PROJECTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECTION_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => onOpenChange(false)} className="rounded-xl border border-[#EAEAEA] px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
            <button disabled={saving} onClick={handleSave} className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-dark">
              Agregar proyección
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
