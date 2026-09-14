/* ============================================================
 * Data service — single access point for treasury data.
 * Persistence layer: Enter Cloud (Postgres + RLS por rol).
 * The financial engine stays pure; this layer maps DB rows to
 * domain types and records an audit trail on every mutation.
 * ============================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
// The generated Database type does not include treasury tables yet,
// so the client is used untyped here, contained to this data layer.

import { amountInClp } from "@/financial-engine/currency";
import { supabase } from "@/integrations/supabase/client";
import {
  activeInvestments,
  agingBuckets,
  aggregateProjection,
  bankPositions,
  derivePayments,
  deepestDeficit,
  expectedCollections,
  expectedPayments,
  movementsBetween,
  nextDeficit,
  openingBalance,
  projectCashFlow,
  receivablesSummary,
  recentMovements,
  reconciliationRows,
} from "@/financial-engine/calculations";
import { todayISO, maskAccount } from "@/financial-engine/format";
import type {
  Bank,
  BankAccount,
  CashFlow,
  CashFlowCategory,
  CashFlowType,
  Customer,
  FxRate,
  Investment,
  Invoice,
  Payment,
  Profile,
  Projection,
  Reconciliation,
} from "@/financial-engine/types";

export interface DashboardData {
  kpis: {
    availableCash: number;
    projectedCash: number;
    expectedCollections: number;
    expectedPayments: number;
    investmentsActive: number;
    obligations: number;
    netLiquidity: number;
  };
  projection: ReturnType<typeof projectCashFlow>;
  projectionWeekly: ReturnType<typeof projectCashFlow>;
  projectionMonthly: ReturnType<typeof projectCashFlow>;
  positions: ReturnType<typeof bankPositions>;
  movements: CashFlow[];
  receivables: ReturnType<typeof receivablesSummary>;
  aging: ReturnType<typeof agingBuckets>;
  upcomingPayments: Payment[];
  deficit: ReturnType<typeof deepestDeficit>;
  nextDeficit: ReturnType<typeof nextDeficit>;
}



/** Untyped handle: the generated DB types do not include treasury tables yet. */
const db = supabase as any;


/** Read every page; Supabase's default row limit must not truncate treasury totals. */
async function readRows(table: string, configure?: (query: any) => any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select("*").order("id").range(offset, offset + 499);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`No se pudieron cargar ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
let fxCache: { expires: number; promise: Promise<Record<string, number>> } | null = null;
function rateMap(): Promise<Record<string, number>> {
  if (fxCache && fxCache.expires > Date.now()) return fxCache.promise;
  const promise = readRows("fx_rates").then((rows) => Object.fromEntries([...rows.map((r) => [r.currency, Number(r.rate_to_clp)]), ["CLP", 1]]));
  fxCache = { expires: Date.now() + 60000, promise };
  promise.catch(() => { fxCache = null; });
  return promise;
}
async function financialRows(table: string, fields: string[], configure?: (query: any) => any): Promise<any[]> {
  const rows = await readRows(table, configure);
  return convertFinancialRows(rows, fields);
}
async function convertFinancialRows(rows: any[], fields: string[]): Promise<any[]> {
  if (!rows.some((r) => r.currency && r.currency !== "CLP")) return rows;
  const rates = await rateMap();
  return rows.map((r) => {
    const source = r.currency ?? "CLP";
    const rate = rates[source];
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Falta una tasa válida para ${source}. No se puede consolidar en CLP.`);
    const converted = { ...r, currency: "CLP" };
    for (const field of fields) converted[field] = amountInClp(Number(r[field] ?? 0), source, rates);
    return converted;
  });
}

/* ----------------------------- Mapping ----------------------------- */

const toBank = (r: any): Bank => ({ id: r.id, name: r.name, status: r.status });
const toAccount = (r: any): BankAccount => ({
  id: r.id,
  bankId: r.bank_id,
  accountNumber: maskAccount(r.account_number),
  currency: r.currency,
  status: r.status,
  balance: Number(r.balance ?? 0),
  reconciledBalance: Number(r.reconciled_balance ?? 0),
  lastReconciliation: r.last_reconciliation,
});
const toCustomer = (r: any): Customer => ({
  id: r.id,
  rut: r.rut,
  name: r.name,
  type: r.type,
  status: r.status,
});
const toInvoice = (r: any): Invoice => ({
  id: r.id,
  customerId: r.customer_id,
  document: r.document,
  issueDate: r.issue_date,
  dueDate: r.due_date,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  status: r.status,
});
const toCashFlow = (r: any): CashFlow => ({
  id: r.id,
  date: r.date,
  type: r.type,
  category: r.category,
  description: r.description,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  bankId: r.bank_id ?? "",
  status: r.status,
  origin: r.origin,
  importRecordId: r.import_record_id,
});
const toInvestment = (r: any): Investment => ({
  id: r.id,
  bankId: r.bank_id ?? "",
  type: r.type,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  startDate: r.start_date,
  endDate: r.end_date,
  rateKnown: r.rate_known !== false,
  rate: Number(r.rate ?? 0),
  estimatedInterest: Number(r.estimated_interest ?? 0),
  status: r.status,
});
const toProjection = (r: any): Projection => ({
  id: r.id,
  date: r.date,
  type: r.type,
  category: r.category,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  description: r.description,
  status: r.status,
  bankId: r.bank_id ?? undefined,
});
const toReconciliation = (r: any): Reconciliation => ({
  id: r.id,
  bankAccountId: r.bank_account_id,
  accountingBalance: Number(r.accounting_balance ?? 0),
  bankBalance: Number(r.bank_balance ?? 0),
  difference: Number(r.difference ?? 0),
  status: r.status,
  reconciledAt: r.reconciled_at,
});
const toProfile = (r: any): Profile => ({
  id: r.id,
  email: r.email ?? "",
  name: r.name ?? "",
  role: r.role,
});

/* --------------------------- Auth helpers --------------------------- */

/** Current signed-in user's display name and role (for audit trail). */
export async function currentUser(): Promise<{ name: string; role: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("name, role")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    name: profile?.name ?? data.user.email ?? "usuario",
    role: profile?.role ?? "consulta",
  };
}

/** Append an audit log entry. Never blocks the business operation. */
export async function logAudit(
  action: string,
  entity: string,
  previousValue: string,
  newValue: string,
) {
  try {
    const u = await currentUser();
    await db.from("audit_logs").insert({
      actor: u?.name ?? "sistema",
      role: u?.role ?? null,
      action,
      entity,
      previous_value: previousValue,
      new_value: newValue,
    });
  } catch {
    /* auditoría no debe interrumpir la operación */
  }
}

/* ------------------------------ Service ------------------------------ */

export const dataService = {
  /** Dashboard bundle. Accepts an optional date range (period selector). */
  async getDashboard(from?: string, to?: string): Promise<DashboardData> {
    const [banks, accounts, originalFlow, invoices, investments, projections] = await Promise.all([
      this.getBanks(), this.getBankAccounts(), this.getMovementsFiltered({}), this.getInvoices(), this.getInvestments(), this.getProjections(),
    ]);
    // Settled historical entries are displayed in their source currency. They
    // are already reflected in bank balances and must not enter projections.
    const flow: CashFlow[] = await convertFinancialRows(originalFlow.filter((m) => !["conciliado","pagado","cancelado","borrador"].includes(m.status)), ["amount"]);
    const future: CashFlow[] = [...flow, ...projections.filter((p) => p.status !== "cancelado" && p.status !== "borrador").map((p) => ({ ...p, bankId: p.bankId ?? "", origin: "projection" as const }))];

    const available = openingBalance(accounts);
    const invested = activeInvestments(investments);

    let projection;
    let collections;
    let payments;
    if (from && to) {
      if (to < from) throw new Error("El fin del período debe ser posterior al inicio.");
      const days = Math.max(
        1,
        Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
      );
      if (!Number.isFinite(days) || days > 366) throw new Error("Selecciona un período válido de hasta 366 días.");
      projection = projectCashFlow(future, accounts, days, from);
      collections = movementsBetween(future.filter((m) => !["conciliado", "pagado", "borrador", "cancelado"].includes(m.status)), from, to, "income", ["collection"]).reduce(
        (a, m) => a + m.amount,
        0,
      );
      payments = movementsBetween(future.filter((m) => !["conciliado", "pagado", "borrador", "cancelado"].includes(m.status)), from, to, "expense").reduce((a, m) => a + m.amount, 0);
    } else {
      projection = projectCashFlow(future, accounts, 30);
      collections = expectedCollections(future, 30);
      payments = expectedPayments(future, 30);
    }

    const projectedCash =
      projection.length > 0 ? projection[projection.length - 1].final : available;
    const deficit = deepestDeficit(projection);

    return {
      kpis: {
        availableCash: available,
        projectedCash,
        expectedCollections: collections,
        expectedPayments: payments,
        investmentsActive: invested,
        obligations: payments,
        netLiquidity: available + invested - payments,
      },
      projection,
      projectionWeekly: aggregateProjection(projection, "weekly"),
      projectionMonthly: aggregateProjection(projection, "monthly"),
      positions: bankPositions(banks, accounts, investments),
      movements: recentMovements(originalFlow, 8),
      receivables: receivablesSummary(invoices, todayISO()),
      aging: agingBuckets(invoices, todayISO()),
      upcomingPayments: derivePayments(flow),
      deficit,
      nextDeficit: nextDeficit(projection),
    };
  },

  async getBanks(): Promise<Bank[]> {
    return (await readRows("banks")).map(toBank);
  },

  async getBankAccounts(): Promise<BankAccount[]> {
    return (await financialRows("bank_accounts", ["balance", "reconciled_balance"])).map(toAccount);
  },

  async getBankPositions() {
    const [banks, accounts, investments] = await Promise.all([
      dataService.getBanks(),
      dataService.getBankAccounts(),
      dataService.getInvestments(),
    ]);
    return bankPositions(banks, accounts, investments);
  },

  async getCashFlow(): Promise<CashFlow[]> {
    return (await financialRows("cash_flow", ["amount"])).map(toCashFlow);
  },

  async getReconciliations(): Promise<(Reconciliation & { bankName: string; accountNumber: string })[]> {
    const [banks, accounts, recs] = await Promise.all([
      dataService.getBanks(),
      dataService.getBankAccounts(),
      readRows("reconciliations"),
    ]);
    const rawAccounts = await readRows("bank_accounts");
    const rates = rawAccounts.some((a) => a.currency !== "CLP") ? await rateMap() : { CLP: 1 };
    const converted = recs.map((r: any) => {
      const currency = rawAccounts.find((a) => a.id === r.bank_account_id)?.currency ?? "CLP";
      const rate = rates[currency];
      if (!rate) throw new Error(`Falta la tasa de ${currency}.`);
      return toReconciliation({ ...r, accounting_balance: Number(r.accounting_balance) * rate, bank_balance: Number(r.bank_balance) * rate, difference: Number(r.difference) * rate });
    });
    return reconciliationRows(converted, accounts, banks);
  },

  async getCustomers(): Promise<Customer[]> {
    return (await readRows("customers")).map(toCustomer);
  },

  async getInvoices(): Promise<Invoice[]> {
    return (await financialRows("invoices", ["amount"])).map(toInvoice);
  },

  async getInvestments(): Promise<Investment[]> {
    return (await financialRows("investments", ["amount", "estimated_interest"])).map(toInvestment);
  },

  async getProjections(): Promise<Projection[]> {
    return (await financialRows("projections", ["amount"])).map(toProjection);
  },

  async getPayments(): Promise<Payment[]> {
    const flow = (await financialRows("cash_flow", ["amount"], (q) => q.eq("type", "expense"))).map(toCashFlow);
    return derivePayments(flow);
  },

  async getAuditLogs(): Promise<{ id: string; user: string; role: string; action: string; date: string; time: string; entity: string; previousValue: string; newValue: string }[]> {
    const { data, error } = await db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("No se pudo cargar el registro de auditoría.");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      user: r.actor,
      role: r.role,
      action: r.action,
      date: (r.created_at ?? "").slice(0, 10),
      time: (r.created_at ?? "").slice(11, 16),
      entity: r.entity ?? "",
      previousValue: r.previous_value ?? "",
      newValue: r.new_value ?? "",
    }));
  },

  async getUsers(): Promise<Profile[]> {
    const data = await readRows("profiles");
    return (data ?? []).map(toProfile);
  },

  async getFxRates(): Promise<FxRate[]> {
    const data = await readRows("fx_rates");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      currency: r.currency,
      rateToClp: Number(r.rate_to_clp),
      updatedAt: r.updated_at,
    }));
  },

  /** Movements filtered for the cash-flow module. */
  async getMovementsFiltered(filters: {
    from?: string;
    to?: string;
    bankId?: string;
    category?: CashFlowCategory;
    type?: CashFlowType;
    status?: string;
  }): Promise<CashFlow[]> {
    const data = await readRows("cash_flow", (query) => {
    let q = query;
    if (filters.from) q = q.gte("date", filters.from);
    if (filters.to) q = q.lte("date", filters.to);
    if (filters.bankId) q = q.eq("bank_id", filters.bankId);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.type) q = q.eq("type", filters.type);
    if (filters.status) q = q.eq("status", filters.status);
    return q;
    });
    return data.map(toCashFlow).sort((a,b) => b.date.localeCompare(a.date));
  },

  /* ------------------------------ Mutations ------------------------------ */

  async addCashFlowEntry(entry: Omit<CashFlow, "id">): Promise<CashFlow> {
    if (!Number.isFinite(entry.amount) || entry.amount <= 0 || !entry.description.trim()) throw new Error("Completa la descripción y un monto mayor a cero.");
    const { data, error } = await db
      .from("cash_flow")
      .insert({
        date: entry.date,
        type: entry.type,
        category: entry.category,
        description: entry.description,
        amount: entry.amount,
        currency: entry.currency,
        bank_id: entry.bankId || null,
        status: entry.status,
      })
      .select()
      .single();
    if (error) throw new Error("No se pudo registrar el movimiento.");
    await logAudit(
      "Registró movimiento",
      "Flujo de caja",
      "—",
      `${entry.description} · $${Number(entry.amount).toLocaleString("es-CL")}`,
    );
    return toCashFlow(data);
  },

  async updateInvestmentStatus(id: string, status: Investment["status"]): Promise<void> {
    const { error } = await db.from("investments").update({ status }).eq("id", id).select("id").single();
    if (error) throw new Error("No se pudo actualizar la inversión.");
    await logAudit(
      status === "rescatada" ? "Marcó inversión como rescatada" : "Programó rescate de inversión",
      "Inversión",
      "—",
      status,
    );
  },

  async addProjection(p: Omit<Projection, "id">): Promise<Projection> {
    const { data, error } = await db
      .from("projections")
      .insert({
        date: p.date,
        type: p.type,
        category: p.category,
        amount: p.amount,
        currency: p.currency,
        description: p.description,
        status: p.status,
        bank_id: p.bankId ?? null,
      })
      .select()
      .single();
    if (error) throw new Error("No se pudo guardar la proyección.");
    await logAudit("Creó proyección", "Proyección", "—", p.description);
    return toProjection(data);
  },

  async updateProjectionStatus(id: string, status: Projection["status"]): Promise<void> {
    const { error } = await db.from("projections").update({ status }).eq("id", id).select("id").single();
    if (error) throw new Error("No se pudo actualizar la proyección.");
    await logAudit("Modificó proyección", "Proyección", "—", status);
  },

  async deleteProjection(id: string): Promise<void> {
    const { error } = await db.from("projections").delete().eq("id", id).select("id").single();
    if (error) throw new Error("No se pudo eliminar la proyección.");
    await logAudit("Eliminó proyección", "Proyección", "—", "Eliminada");
  },
};
