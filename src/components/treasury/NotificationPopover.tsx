import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { formatDateMedium } from "@/financial-engine/format";

/** Alerts are derived from persisted treasury data only when the panel is opened. */
export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const {data, loading, error} = useAsyncData(() => open ? dataService.getDashboard() : Promise.resolve(null),[open]);
  const alerts = data ? [
    ...(data.nextDeficit ? [{title:"Déficit de caja proyectado",body:`Saldo negativo previsto el ${formatDateMedium(data.nextDeficit.date)}.`}] : []),
    ...data.positions.filter(p=>p.difference!==0).map(p=>({title:"Conciliación por revisar",body:`${p.bank.name} presenta una diferencia entre saldos.`})),
    ...(data.receivables.overdue > 0 ? [{title:"Facturas vencidas",body:"Hay cuentas por cobrar vencidas. Revisa el módulo de Cobranzas."}] : []),
  ] : [];
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button aria-label="Notificaciones" className="flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-brand"><Bell size={17} /></button></PopoverTrigger><PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-0"><div className="border-b px-4 py-3 text-sm font-semibold">Alertas de tesorería</div><div className="max-h-80 overflow-y-auto p-4">{loading ? <p className="text-sm text-muted-foreground">Consultando datos…</p> : error ? <p className="text-sm text-danger">No se pudieron consultar las alertas.</p> : alerts.length ? alerts.map((a,i)=><div key={i} className="border-b py-3 first:pt-0 last:border-0"><p className="text-sm font-medium">{a.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p></div>) : <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 size={17} className="text-success" />Sin alertas con los datos disponibles.</div>}</div></PopoverContent></Popover>;
}
