import { NavLink } from "react-router-dom";
import { useState } from "react";
import { ArrowLeftRight, FileText, HandCoins, Landmark, LayoutDashboard, Menu, PieChart, Plug, Send, Settings, TrendingUp, Upload, CalendarRange } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const GROUPS = [
  { label: "VISIÓN GENERAL", items: [{ to: "/dashboard", label: "Resumen", icon: LayoutDashboard }, { to: "/cashflow", label: "Flujo de caja", icon: TrendingUp }, { to: "/banks", label: "Bancos", icon: Landmark }] },
  { label: "OPERACIONES", items: [{ to: "/receivables", label: "Cobranzas", icon: HandCoins }, { to: "/payments", label: "Pagos", icon: Send }, { to: "/investments", label: "Inversiones", icon: PieChart }, { to: "/projections", label: "Proyecciones", icon: CalendarRange }, { to: "/reconciliation", label: "Conciliación", icon: ArrowLeftRight }] },
  { label: "DATOS Y CONTROL", items: [{ to: "/reports", label: "Reportes", icon: FileText }, { to: "/importations", label: "Importaciones", icon: Upload }, { to: "/integrations", label: "Integraciones", icon: Plug }] },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return <nav aria-label="Navegación principal" className="space-y-5 px-3 py-3">{GROUPS.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => cn("flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors", isActive ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-brand")}><Icon size={18} strokeWidth={1.8} />{label}</NavLink>)}</div></div>)}</nav>;
}
export function Sidebar() {
  return <aside className="hidden h-full w-[212px] shrink-0 flex-col border-r bg-white lg:flex"><NavLink to="/dashboard" className="flex h-[84px] shrink-0 items-center border-b px-6"><img src="/logo-sonacol.png" alt="SONACOL" className="w-[140px]" /></NavLink><div className="min-h-0 flex-1 overflow-y-auto py-3"><Navigation /></div><NavLink to="/settings" className="mx-3 mb-4 flex items-center gap-3 rounded-xl border bg-slate-50 px-3 py-3 text-[13px] text-slate-600"><Settings size={18} />Configuración</NavLink><div className="border-t px-6 py-4 text-[10px] tracking-wider text-slate-400">SONACOL · TESORERÍA</div></aside>;
}
export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button aria-label="Abrir navegación" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border lg:hidden"><Menu size={20} /></button></SheetTrigger><SheetContent side="left" className="flex w-[285px] flex-col overflow-y-auto p-0"><SheetHeader className="border-b px-6 py-5 text-left"><SheetTitle><img src="/logo-sonacol.png" alt="SONACOL" className="w-36" /></SheetTitle><SheetDescription>Gestión de tesorería</SheetDescription></SheetHeader><Navigation onNavigate={() => setOpen(false)} /><NavLink to="/settings" onClick={() => setOpen(false)} className="mx-6 mb-5 flex items-center gap-3 rounded-xl border p-3 text-sm"><Settings size={17} />Configuración</NavLink></SheetContent></Sheet>;
}
