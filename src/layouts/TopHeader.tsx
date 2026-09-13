import { MobileNavigation } from "./Sidebar";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { CurrencySelector } from "@/components/treasury/CurrencySelector";
import { NotificationPopover } from "@/components/treasury/NotificationPopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, roleLabel } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/cashflow": "Flujo de Caja",
  "/banks": "Bancos",
  "/reconciliation": "Conciliación",
  "/receivables": "Cuentas por Cobrar",
  "/payments": "Pagos",
  "/investments": "Inversiones",
  "/projections": "Proyecciones",
  "/reports": "Reportes",
  "/importations": "Importaciones",
  "/integrations": "Integraciones",
  "/settings": "Configuración",
};

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ST"
  );
}

/** Clean horizontal header: section title + currency + user. */
export function TopHeader() {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const title = TITLES[pathname] ?? "SONACOL Treasury";
  const name = user?.name ?? "Usuario";
  const role = user?.role ?? "consulta";
  const canWrite = role === "administrador" || role === "tesoreria";

  return (
    <header data-shell-header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#EAEAEA] bg-card/80 px-4 backdrop-blur sm:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation />
        <span className="hidden text-xs text-slate-400 sm:block">Tesorería /</span>
        <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <CurrencySelector className="inline-flex" />
        <NotificationPopover />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Menú de usuario" className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-muted">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl text-[12px] font-bold",
                  canWrite ? "bg-brand-soft text-brand-dark" : "bg-muted text-muted-foreground",
                )}
              >
                {initials(name)}
              </span>
              <span className="hidden text-left lg:block">
                <span className="block max-w-[140px] truncate text-[12px] font-semibold leading-tight text-foreground">
                  {name}
                </span>
                <span className="block text-[10.5px] leading-tight text-muted-foreground">
                  {roleLabel(role)}
                </span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-[13px] font-semibold text-foreground">{name}</p>
              <p className="text-[11px] font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rol
              </span>
              <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-dark">
                {roleLabel(role)}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void signOut().catch((e) => toast.error(e.message)); }}>
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
