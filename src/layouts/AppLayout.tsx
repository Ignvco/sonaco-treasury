import { ErrorState } from "@/components/treasury/feedback";
import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { useAuth } from "@/contexts/auth-context";

/** App shell: compact sidebar + header + scrollable content. Auth-guarded. */
export function AppLayout() {
  const { user, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <p className="text-[13px]">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="shrink-0 lg:flex lg:h-full lg:flex-col">
          <Sidebar />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopHeader />
          <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 md:py-7 xl:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
