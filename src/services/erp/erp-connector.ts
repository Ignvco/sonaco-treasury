/* ============================================================
 * ERP Connector — abstracción conceptual.
 * La implementación real se construirá cuando se conozcan:
 * fabricante, versión, base de datos, API, conexión, credenciales.
 * NUNCA se conecta a servicios externos sin configuración explícita,
 * y NUNCA se conecta desde el navegador: pasa por backend.
 * ============================================================ */

export type ERPOpStatus = "disponible" | "pendiente" | "no_soportado";

export interface ERPCapability {
  operation: string;
  status: ERPOpStatus;
}

export interface ERPConnector {
  name: string;
  isConfigured: boolean;
  capabilities: ERPCapability[];
  getCustomers(): Promise<never>;
  getInvoices(): Promise<never>;
  getBankMovements(): Promise<never>;
  getLedger(): Promise<never>;
  getAccounts(): Promise<never>;
  getBalances(): Promise<never>;
}

const notConfigured = (op: string) => {
  throw new Error(
    `ERP no configurado: ${op} requiere fabricante, versión y credenciales. ` +
      "La integración se habilitará en un connector de backend.",
  );
};

/** Crea el conector conceptual (sin configuración real todavía). */
export function createERPConnector(): ERPConnector {
  return {
    name: "ERP Corporativo",
    isConfigured: false,
    capabilities: [
      { operation: "getCustomers()", status: "pendiente" },
      { operation: "getInvoices()", status: "pendiente" },
      { operation: "getBankMovements()", status: "pendiente" },
      { operation: "getLedger()", status: "pendiente" },
      { operation: "getAccounts()", status: "pendiente" },
      { operation: "getBalances()", status: "pendiente" },
    ],
    getCustomers: () => notConfigured("getCustomers()"),
    getInvoices: () => notConfigured("getInvoices()"),
    getBankMovements: () => notConfigured("getBankMovements()"),
    getLedger: () => notConfigured("getLedger()"),
    getAccounts: () => notConfigured("getAccounts()"),
    getBalances: () => notConfigured("getBalances()"),
  };
}
