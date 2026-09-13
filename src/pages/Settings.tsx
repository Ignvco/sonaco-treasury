import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, FileCog, Plug, Shield, Upload, UserCog } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { CurrencySelector } from "@/components/treasury/CurrencySelector";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { useAuth, roleLabel } from "@/contexts/auth-context";
import { formatAuditDate, formatNumber } from "@/financial-engine/format";
import type { UserRole } from "@/financial-engine/types";
import { cn } from "@/lib/utils";

const ROLES = [
  { name: "Administrador", scope: "Acceso total al sistema", tone: "brand" as const },
  { name: "Tesorería", scope: "Flujo, bancos, pagos e inversiones", tone: "brand" as const },
  { name: "Contabilidad", scope: "Conciliación y reportes", tone: "warning" as const },
  { name: "Consulta", scope: "Solo lectura", tone: "muted" as const },
];

const PARAMETERS = [
  { id: "p1", code: "1", name: "SONACOL S.A.", type: "Empresa", status: "Activa" },
  { id: "p2", code: "10", name: "Factura de Venta Afecta", type: "Tipo documento", status: "Activo" },
  { id: "p3", code: "11", name: "Factura de Compra Mixta", type: "Tipo documento", status: "Activo" },
  { id: "p4", code: "12", name: "Factura de Venta Extenta", type: "Tipo documento", status: "Activo" },
  { id: "p5", code: "20", name: "Proveedores", type: "Categoría", status: "Activo" },
  { id: "p6", code: "21", name: "Remuneraciones", type: "Categoría", status: "Activo" },
  { id: "p7", code: "22", name: "Impuestos", type: "Categoría", status: "Activo" },
  { id: "p8", code: "30", name: "CLP — Peso chileno", type: "Moneda", status: "Activa" },
  { id: "p9", code: "31", name: "USD — Dólar", type: "Moneda", status: "Activa" },
  { id: "p10", code: "32", name: "UF — Unidad de fomento", type: "Moneda", status: "Activa" },
];

export default function Settings() {
  const { user } = useAuth();
  const { data: audit, loading, error } = useAsyncData(() => dataService.getAuditLogs(), []);
  const { data: users } = useAsyncData(() => dataService.getUsers(), []);
  const { data: fxRates } = useAsyncData(() => dataService.getFxRates(), []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!audit) return <EmptyState />;

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader title="Configuración" subtitle="Parámetros, preferencias, roles y auditoría" />

      <div className="grid grid-cols-12 gap-5">
        {/* Parameters */}
        <SectionCard
          title="Parámetros"
          subtitle="Empresas, tipos de documento, categorías y monedas"
          className="col-span-12 xl:col-span-7"
          action={
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
              <FileCog className="h-4 w-4" strokeWidth={1.8} />
            </span>
          }
        >
          <DataTable
            data={PARAMETERS}
            rowKey={(p) => p.id}
            search
            searchText={(p) => `${p.name} ${p.type} ${p.code}`}
            pageSize={6}
            columns={[
              { key: "code", header: "Código", sortValue: (p) => p.code, render: (p) => <span className="t-num text-muted-foreground">{p.code}</span> },
              { key: "name", header: "Nombre", sortValue: (p) => p.name, render: (p) => <span className="font-medium">{p.name}</span> },
              { key: "type", header: "Tipo", hideBelow: "md", sortValue: (p) => p.type, render: (p) => <span className="text-muted-foreground">{p.type}</span> },
              { key: "status", header: "Estado", align: "center", render: (p) => (
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", p.status === "Activa" || p.status === "Activo" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                  {p.status}
                </span>
              ) },
            ]}
          />
        </SectionCard>

        {/* Preferences + roles */}
        <div className="col-span-12 flex flex-col gap-5 xl:col-span-5">
          <SectionCard title="Preferencias" subtitle="Visualización y seguridad de datos" bodyClassName="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Moneda de visualización</p>
                <p className="text-[12px] text-muted-foreground">Cambia el formato en toda la aplicación</p>
              </div>
              <CurrencySelector />
            </div>
            <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">Las cuentas bancarias se muestran enmascaradas. La información original se conserva en la base de datos para su trazabilidad.</p>
            <div className="flex items-center justify-between rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">Mi rol</p>
                <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
              </div>
              <RoleBadge role={user?.role ?? "consulta"} />
            </div>
            <div>
              <p className="t-label mb-2">Tasas de cambio · base CLP</p>
              <div className="flex flex-wrap gap-2">
                {fxRates && fxRates.length > 0 ? (
                  fxRates
                    .filter((r) => r.currency !== "CLP")
                    .map((r) => (
                      <span
                        key={r.currency}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark"
                      >
                        {r.currency}
                        <span className="t-num">{formatNumber(r.rateToClp)}</span>
                      </span>
                    ))
                ) : (
                  <span className="text-[12px] text-muted-foreground">Sin tasas configuradas.</span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Conversión automática al seleccionar la moneda de visualización.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Usuarios y roles" subtitle="Cuentas registradas en el sistema" bodyClassName="pt-2">
            {users && users.length > 0 ? (
              <DataTable
                data={users}
                rowKey={(u) => u.id}
                pageSize={5}
                columns={[
                  { key: "name", header: "Usuario", sortValue: (u) => u.name, render: (u) => <span className="font-medium">{u.name}</span> },
                  { key: "email", header: "Correo", hideBelow: "md", render: (u) => <span className="truncate text-muted-foreground">{u.email}</span> },
                  {
                    key: "role",
                    header: "Rol",
                    align: "center",
                    render: (u) => <RoleBadge role={u.role} me={u.id === user?.id} />,
                  },
                ]}
              />
            ) : (
              <p className="py-4 text-center text-[12px] text-muted-foreground">
                Aún no hay usuarios registrados.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Roles" subtitle="Permisos vigentes por rol" bodyClassName="flex flex-col gap-2.5">
            {ROLES.map((role) => (
              <div key={role.name} className="flex items-center gap-3 rounded-2xl border border-[#EAEAEA] px-4 py-3">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    role.tone === "brand" && "bg-brand-soft text-brand-dark",
                    role.tone === "warning" && "bg-warning-soft text-warning",
                    role.tone === "muted" && "bg-muted text-muted-foreground",
                  )}
                >
                  <Shield className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">{role.name}</p>
                  <p className="text-[12px] text-muted-foreground">{role.scope}</p>
                </div>
              </div>
            ))}
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <UserCog className="h-3.5 w-3.5" />
              Los permisos se aplican en la base de datos (RLS) según el rol del usuario.
            </p>
          </SectionCard>
        </div>
      </div>

      {/* Data platform */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Link
          to="/importations"
          className="t-card t-card-hover flex items-center gap-4 p-5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
            <Upload className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground">Importaciones</p>
            <p className="text-[12px] text-muted-foreground">
              Importador Excel histórico (ETL), validación y trazabilidad
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/integrations"
          className="t-card t-card-hover flex items-center gap-4 p-5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
            <Plug className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground">Integraciones</p>
            <p className="text-[12px] text-muted-foreground">
              Centro de integraciones: ERP, Excel y bancos
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Audit */}
      <SectionCard
        title="Registro de Auditoría"
        subtitle="Trazabilidad de acciones del equipo"
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <Building2 className="h-4 w-4" strokeWidth={1.8} />
          </span>
        }
      >
        <DataTable
          data={audit}
          rowKey={(a) => a.id}
          pageSize={6}
          defaultSort={{ key: "date", dir: "desc" }}
          columns={[
            { key: "user", header: "Usuario", sortValue: (a) => a.user, render: (a) => <span className="font-medium">{a.user}</span> },
            { key: "action", header: "Acción", sortValue: (a) => a.action, render: (a) => <span>{a.action}</span> },
            { key: "entity", header: "Entidad", hideBelow: "md", render: (a) => <span className="text-muted-foreground">{a.entity}</span> },
            { key: "date", header: "Fecha", hideBelow: "md", sortValue: (a) => a.date, render: (a) => <span className="text-muted-foreground">{formatAuditDate(a.date, a.time)}</span> },
            { key: "changes", header: "Cambio", hideBelow: "lg", render: (a) => (
              <span className="text-[12px] text-muted-foreground">
                {a.previousValue} → <span className="font-medium text-foreground">{a.newValue}</span>
              </span>
            ) },
          ]}
        />
      </SectionCard>

      <p className="text-[12px] text-muted-foreground">
        Los parámetros de referencia son un catálogo informativo. El ERP y la conexión bancaria requieren configurar sus conectores.
      </p>
    </div>
  );
}

function RoleBadge({ role, me }: { role: UserRole; me?: boolean }) {
  const tone: Record<UserRole, string> = {
    administrador: "bg-brand-soft text-brand-dark",
    tesoreria: "bg-success-soft text-success",
    contabilidad: "bg-warning-soft text-warning",
    consulta: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tone[role] ?? "bg-muted text-muted-foreground",
      )}
    >
      {roleLabel(role)}
      {me && <span className="opacity-60">· tú</span>}
    </span>
  );
}
