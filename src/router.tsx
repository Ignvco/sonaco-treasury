import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const Banks = lazy(() => import("./pages/Banks"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const Receivables = lazy(() => import("./pages/Receivables"));
const Payments = lazy(() => import("./pages/Payments"));
const Investments = lazy(() => import("./pages/Investments"));
const Projections = lazy(() => import("./pages/Projections"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Importations = lazy(() => import("./pages/Importations"));
const Integrations = lazy(() => import("./pages/Integrations"));
const NotFound = lazy(() => import("./pages/NotFound"));

export const routers = [
  {
    path: "/login",
    name: "Login",
    element: <Login />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", name: "Dashboard", element: <Dashboard /> },
      { path: "cashflow", name: "Flujo de Caja", element: <CashFlow /> },
      { path: "banks", name: "Bancos", element: <Banks /> },
      { path: "reconciliation", name: "Conciliación", element: <Reconciliation /> },
      { path: "receivables", name: "Cuentas por Cobrar", element: <Receivables /> },
      { path: "payments", name: "Pagos", element: <Payments /> },
      { path: "investments", name: "Inversiones", element: <Investments /> },
      { path: "projections", name: "Proyecciones", element: <Projections /> },
      { path: "reports", name: "Reportes", element: <Reports /> },
      { path: "importations", name: "Importaciones", element: <Importations /> },
      { path: "integrations", name: "Integraciones", element: <Integrations /> },
      { path: "settings", name: "Configuración", element: <Settings /> },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
