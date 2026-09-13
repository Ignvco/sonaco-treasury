import { Suspense } from "react";
import { LoadingState } from "./components/treasury/feedback";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routers } from "./router";
import { CurrencyProvider } from "./contexts/currency-context";
import { AuthProvider } from "./contexts/auth-context";

const queryClient = new QueryClient();

const router = createBrowserRouter(routers);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<LoadingState label="Cargando aplicación…" />}><RouterProvider router={router} /></Suspense>
          </CurrencyProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
