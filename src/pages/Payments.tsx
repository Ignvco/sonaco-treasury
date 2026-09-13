import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { useCanWrite } from "@/contexts/auth-context";
import { CASHFLOW_STATUS_LABEL, type Payment } from "@/financial-engine/types";
import { formatDateMedium, todayISO } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Payments() {
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useAsyncData(() => dataService.getPayments(), [refresh]);
  const { data: banks } = useAsyncData(() => dataService.getBanks(), []);
  const { money } = useCurrency();
  const [open, setOpen] = useState(false);
  const canWrite = useCanWrite();

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.reduce((a, p) => a + p.amount, 0);
    const thisWeek = data
      .filter((p) => {
        const diff = Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86_400_000);
        return diff >= 0 && diff <= 7;
      })
      .reduce((a, p) => a + p.amount, 0);
    return {
      total,
      count: data.length,
      thisWeek,
      committed: data
        .filter((p) => p.status !== "borrador")
        .reduce((a, p) => a + p.amount, 0),
    };
  }, [data]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data || !summary) return <EmptyState />;

  const exportRows = data.map((p) => ({
    Proveedor: p.supplier,
    Vencimiento: formatDateMedium(p.dueDate),
    Monto: p.amount,
    Categoría: "Proveedores",
    Estado: CASHFLOW_STATUS_LABEL[p.status],
  }));

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Pagos"
        subtitle="Programación de pagos a proveedores"
        actions={
          canWrite ? (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              <Plus className="h-4 w-4" />
              Registrar pago
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Próximos pagos" value={summary.total} subtext={`${summary.count} pagos programados`} icon={undefined} />
        <KpiCard label="Vencen esta semana" value={summary.thisWeek} subtext="Próximos 7 días" tone="warning" />
        <KpiCard label="Comprometido" value={summary.committed} subtext="Sin borradores" tone="default" icon={undefined} />
      </div>

      <SectionCard title="Programación de Pagos" subtitle="Pagos pendientes y programados" bodyClassName="pt-2">
        <DataTable<Payment>
          data={data}
          rowKey={(p) => p.id}
          search
          searchText={(p) => `${p.supplier} ${p.category} ${p.status}`}
          pageSize={10}
          defaultSort={{ key: "dueDate", dir: "asc" }}
          actions={(p) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => toast.info("Pago marcado como pagado", { description: p.supplier })}>
                  Marcar pagado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Pago editado", { description: p.supplier })}>
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Borrador creado", { description: p.supplier })}>
                  Duplicar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          columns={[
            { key: "supplier", header: "Proveedor", sortValue: (p) => p.supplier, render: (p) => <span className="font-medium">{p.supplier}</span> },
            { key: "due", header: "Vencimiento", sortValue: (p) => p.dueDate, render: (p) => <span className="text-muted-foreground">{formatDateMedium(p.dueDate)}</span> },
            { key: "amount", header: "Monto", align: "right", sortValue: (p) => p.amount, render: (p) => <span className="t-num font-semibold">{money(p.amount)}</span> },
            { key: "category", header: "Categoría", hideBelow: "md", render: () => <span className="text-muted-foreground">Proveedores</span> },
            {
              key: "status",
              header: "Estado",
              align: "center",
              render: (p) => (
                <StatusBadge
                  label={CASHFLOW_STATUS_LABEL[p.status]}
                  tone={p.status === "pendiente" ? "warning" : p.status === "borrador" ? "muted" : "info"}
                />
              ),
            },
          ]}
        />
      </SectionCard>

      {banks && (
        <RegisterPaymentDialog
          open={open}
          onOpenChange={setOpen}
          banks={banks}
          onSaved={() => setRefresh((r) => r + 1)}
        />
      )}
    </div>
  );
}

function RegisterPaymentDialog({
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
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("programado");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSupplier("");
    setAmount("");
    setBankId("");
    setDate(todayISO());
    setStatus("programado");
    setError("");
  };

  const handleSave = async () => {
    if (saving) return;
    const value = Number(amount);
    if (!supplier.trim()) return setError("El proveedor es obligatorio.");
    if (!Number.isFinite(value) || value <= 0) return setError("Ingresa un monto válido mayor a cero.");
    if (!bankId) return setError("Selecciona el banco de origen.");
    setSaving(true);
    try {
      await dataService.addCashFlowEntry({
        date,
        type: "expense",
        category: "supplier",
        description: `Pago proveedor — ${supplier.trim()}`,
        amount: value,
        currency: "CLP",
        bankId,
        status: status as Payment["status"],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo programar el pago.");
      return;
    } finally { setSaving(false); }
    toast.success("Pago programado", { description: `${supplier.trim()} · ${money(value)}` });
    onSaved?.();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">Registrar pago</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <Field label="Proveedor">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej. Proveedor Industrial A" className="t-input w-full" />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Monto (CLP)">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="t-input w-full" />
            </Field>
            <Field label="Vencimiento">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="t-input w-full" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Banco origen">
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
                {["programado", "pendiente", "confirmado", "borrador"].map((s) => (
                  <option key={s} value={s}>
                    {CASHFLOW_STATUS_LABEL[s as Payment["status"]]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => onOpenChange(false)} className="rounded-xl border border-[#EAEAEA] px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
              Cancelar
            </button>
            <button disabled={saving} onClick={handleSave} className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark">
              Programar pago
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
