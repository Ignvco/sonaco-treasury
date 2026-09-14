/* ============================================================
 * SONACOL TREASURY — Domain types
 * Entities mirror the functional modules of the legacy Excel
 * workbook (CAJA SONACOL) but are normalized and strict.
 * ============================================================ */

export type Currency = "CLP" | "USD" | "UF" | "UTM";

export const CURRENCIES: Currency[] = ["CLP", "USD", "UF", "UTM"];

export type CashFlowType = "income" | "expense";

export type CashFlowCategory =
  // Income
  | "collection"
  | "investment_redemption"
  | "other_income"
  | "bank_credit"
  // Expense
  | "supplier"
  | "payroll"
  | "tax"
  | "dividends"
  | "credit"
  | "social_levies";

export const INCOME_CATEGORIES: CashFlowCategory[] = [
  "collection",
  "investment_redemption",
  "other_income",
  "bank_credit",
];

export const EXPENSE_CATEGORIES: CashFlowCategory[] = [
  "supplier",
  "payroll",
  "tax",
  "dividends",
  "credit",
  "social_levies",
];

export type CashFlowStatus =
  | "proyectado"
  | "confirmado"
  | "programado"
  | "pendiente"
  | "pagado"
  | "conciliado"
  | "borrador"
  | "cancelado"
  | "vencido";

export type InvoiceStatus = "por_vencer" | "vence_pronto" | "vencido" | "pagado";

export type InvestmentType = "fondo_mutuo" | "colocacion";

export type InvestmentStatus =
  | "vigente"
  | "por_vencer"
  | "rescate_programado"
  | "rescatada";

export type BankStatus = "activo" | "revisar";

/* ---------------------------- Entities ---------------------------- */

export interface Bank {
  id: string;
  name: string;
  status: BankStatus;
}

export interface BankAccount {
  id: string;
  bankId: string;
  accountNumber: string; // stored masked-safe: **** **** 2493
  currency: Currency;
  status: BankStatus;
  balance: number; // contable balance (CLP)
  reconciledBalance: number; // saldo conciliado (CLP)
  lastReconciliation: string; // ISO date
}

export interface Customer {
  id: string;
  rut: string;
  name: string;
  type: string;
  status: BankStatus;
}

export interface Invoice {
  id: string;
  customerId: string;
  document: string;
  issueDate: string; // ISO
  dueDate: string; // ISO
  amount: number;
  currency: Currency;
  status: InvoiceStatus;
}

export interface CashFlow {
  id: string;
  date: string; // ISO
  type: CashFlowType;
  category: CashFlowCategory;
  description: string;
  amount: number;
  currency: Currency;
  bankId: string;
  status: CashFlowStatus;
  /** Procedencia del dato: manual, importado desde Excel o desde ERP. */
  origin?: "manual" | "excel" | "erp";
  /** Trazabilidad: registro de importación de origen. */
  importRecordId?: string;
}

export interface Investment {
  id: string;
  bankId: string;
  type: InvestmentType;
  amount: number;
  currency: Currency;
  startDate: string; // ISO
  endDate: string; // ISO
  rateKnown?: boolean;
  rate: number; // annual rate %
  estimatedInterest: number;
  status: InvestmentStatus;
}

export interface Payment {
  id: string;
  supplier: string;
  dueDate: string; // ISO
  amount: number;
  currency: Currency;
  category: string;
  status: CashFlowStatus;
}

export interface Projection {
  id: string;
  date: string; // ISO
  type: CashFlowType;
  category: CashFlowCategory;
  amount: number;
  currency: Currency;
  description: string;
  status: "borrador" | "proyectado" | "confirmado" | "cancelado";
  bankId?: string;
}

export interface Reconciliation {
  id: string;
  bankAccountId: string;
  accountingBalance: number;
  bankBalance: number;
  difference: number;
  status: BankStatus;
  reconciledAt: string; // ISO
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  date: string; // ISO date
  time: string; // HH:mm
  entity: string;
  previousValue: string;
  newValue: string;
}

export type UserRole = "administrador" | "tesoreria" | "contabilidad" | "consulta";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface FxRate {
  id: string;
  currency: Currency;
  rateToClp: number;
  updatedAt: string;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  administrador: "Administrador",
  tesoreria: "Tesorería",
  contabilidad: "Contabilidad",
  consulta: "Consulta",
};

/* ----------------------- Data platform ----------------------- */

export type ImportRecordStatus = "VALID" | "WARNING" | "ERROR" | "DUPLICATE";

export type ImportEntityType =
  | "customer"
  | "invoice"
  | "cash_flow"
  | "investment"
  | "projection"
  | "bank_account"
  | "reconciliation"
  | "unknown";

export interface ImportBatch {
  importedRecords?: number | null;
  id: string;
  fileName: string;
  source: string;
  uploadedBy: string | null;
  status: string;
  totalRecords: number;
  validRecords: number;
  warningRecords: number;
  errorRecords: number;
  duplicateRecords: number;
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  importBatchId: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  status: ImportRecordStatus;
  entityType: ImportEntityType;
  entityId: string | null;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  warnings: string;
  createdAt: string;
}

export interface SyncSource {
  id: string;
  source: "erp" | "excel" | "banks";
  name: string;
  status: "connected" | "disconnected" | "syncing";
  lastSyncAt: string | null;
  recordsSynced: number;
  errors: number;
  enabled: boolean;
}

export interface SyncHistory {
  verified?: boolean;
  id: string;
  source: string;
  records: number;
  durationSeconds: number;
  status: "Connected" | "Syncing" | "Success" | "Warning" | "Error" | "Unverified" | "NoChanges";
  errorMessage: string | null;
  syncedAt: string;
}

export const IMPORT_RECORD_STATUS_LABEL: Record<ImportRecordStatus, string> = {
  VALID: "Válido",
  WARNING: "Advertencia",
  ERROR: "Error",
  DUPLICATE: "Duplicado",
};

/* ------------------------- Label maps (ES) ------------------------- */

export const CASHFLOW_CATEGORY_LABEL: Record<CashFlowCategory, string> = {
  collection: "Recaudación Clientes",
  investment_redemption: "Rescate de Inversiones",
  other_income: "Ingresos varios",
  bank_credit: "Abonos bancarios",
  supplier: "Proveedores",
  payroll: "Remuneraciones",
  tax: "Impuestos",
  dividends: "Dividendos",
  credit: "Créditos",
  social_levies: "Leyes sociales",
};

export const CASHFLOW_TYPE_LABEL: Record<CashFlowType, string> = {
  income: "Ingreso",
  expense: "Egreso",
};

export const CASHFLOW_STATUS_LABEL: Record<CashFlowStatus, string> = {
  proyectado: "Proyectado",
  confirmado: "Confirmado",
  programado: "Programado",
  pendiente: "Pendiente",
  pagado: "Pagado",
  conciliado: "Conciliado",
  borrador: "Borrador",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> = {
  fondo_mutuo: "Fondo Mutuo",
  colocacion: "Colocación",
};

export const INVESTMENT_STATUS_LABEL: Record<InvestmentStatus, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  rescate_programado: "Rescate programado",
  rescatada: "Rescatada",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  por_vencer: "Por vencer",
  vence_pronto: "Vence pronto",
  vencido: "Vencido",
  pagado: "Pagado",
};

export const PROJECTION_STATUS_LABEL: Record<Projection["status"], string> = {
  borrador: "Borrador",
  proyectado: "Proyectado",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
};
