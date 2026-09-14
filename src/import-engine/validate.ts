import type { ImportEntityType } from "@/financial-engine/types";
import { validDate } from "./detect";
import type { ImportIssue } from "./types";

interface Validatable {
  entityType: ImportEntityType;
  bank?: unknown; balance?: unknown; reconciledBalance?: unknown;
  document?: unknown; amount?: unknown; debe?: unknown; haber?: unknown;
  issueDate?: unknown; dueDate?: unknown; date?: unknown;
  startDate?: unknown; endDate?: unknown; customer?: unknown; rut?: unknown;
  description?: unknown; currencyKnown: boolean;
}

/** Entity-specific requirements. A zero on the unused side is normal accounting data. */
export function validateRecord(r: Validatable): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const error = (message: string) => issues.push({ kind: "error", message });
  const requireDate = (value: unknown, label: string) => {
    if (!validDate(String(value ?? ""))) error(`Fecha de ${label} faltante o inválida (dd/mm/aaaa).`);
  };
  if (r.entityType === "unknown") error("No se reconoció el tipo de datos. Configura las columnas y el destino de esta hoja.");
  if (r.entityType === "reconciliation") error("Los saldos de conciliación requieren revisión manual; esta hoja no se importará como movimientos.");
  if (r.entityType === "bank_account") {
    if (!r.bank) error("Falta el banco de la cuenta.");
    requireDate(r.date,"saldo");
    for (const value of [r.balance,r.reconciledBalance]) if (typeof value!=="number" || !Number.isFinite(value)) error("Saldo contable o conciliado inválido.");
    return issues;
  }
  if (r.entityType === "customer") {
    if (!String(r.customer ?? "").trim()) error("Falta el nombre del cliente.");
    return issues;
  }
  if (r.entityType === "invoice") {
    if (!String(r.document ?? "").trim() || String(r.document) === "0") error("Falta un número de documento válido.");
    if (!String(r.customer ?? "").trim()) error("Falta el cliente de la factura.");
    requireDate(r.issueDate, "emisión");
    requireDate(r.dueDate, "vencimiento");
    if (r.dueDate && (r.issueDate ?? r.date) && String(r.dueDate) < String(r.issueDate ?? r.date)) error("El vencimiento es anterior a la emisión.");
  }
  if (r.entityType === "investment") {
    requireDate(r.startDate, "inicio"); requireDate(r.endDate, "término");
    if (r.startDate && r.endDate && String(r.endDate) < String(r.startDate)) error("El término es anterior al inicio.");
  }
  if (r.entityType === "cash_flow" || r.entityType === "projection") requireDate(r.date, "movimiento");
  if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0) error("Monto faltante, no numérico o igual a cero.");
  if (!r.currencyKnown) error("Moneda desconocida. Corrige la moneda antes de importar.");
  return issues;
}
