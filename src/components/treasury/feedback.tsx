import { AlertTriangle, Inbox, Loader2, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Cargando datos…" }: { label?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "Sin información",
  description = "No hay datos para mostrar en esta sección.",
  icon,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center", className)}>
      {icon ?? (
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Inbox className="h-5 w-5" strokeWidth={1.8} />
        </span>
      )}
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      <p className="max-w-[320px] text-[12px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function NoResults({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-[14px] font-semibold text-foreground">Sin resultados</p>
      <p className="max-w-[320px] text-[12px] leading-relaxed text-muted-foreground">
        Ningún registro coincide con los filtros aplicados.
      </p>
      {onReset && (
        <button
          onClick={onReset}
          className="mt-1 text-[12px] font-semibold text-brand hover:text-brand-dark"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  message = "No se pudo cargar la información.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-[14px] font-semibold text-foreground">Ocurrió un error</p>
      <p className="max-w-[320px] text-[12px] leading-relaxed text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-xl bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-dark"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Renders loading/error/empty around a ready view. */
export function ScreenState<T>({
  data,
  loading,
  error,
  empty,
  children,
}: {
  data: T;
  loading: boolean;
  error: string | null;
  empty?: boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (empty) return <EmptyState />;
  return <>{children(data)}</>;
}
