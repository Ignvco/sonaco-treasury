/* ============================================================
 * SONACOL TREASURY — Financial engine
 * All treasury math lives here, never inside UI components.
 *
 * Core formulas:
 *   Saldo proyectado = saldo inicial + ingresos - egresos
 *   Liquidez neta    = caja disponible + inversiones líquidas
 *                      - obligaciones proyectadas
 * ============================================================ */

import type {
  Bank,
  BankAccount,
  CashFlow,
  CashFlowCategory,
  Customer,
  Investment,
  Invoice,
  Payment,
  Reconciliation,
} from "./types";

export interface DailyProjection {
  date: string;
  initial: number;
  income: number;
  expense: number;
  final: number;
  variation: number;
}

export interface BankPosition {
  bank: Bank;
  account: BankAccount;
  available: number;
  reconciled: number;
  difference: number;
  invested: number;
  status: Bank["status"];
}

export interface LiquidityMetrics {
  availableCash: number;
  projectedCash: number;
  expectedCollections: number;
  expectedPayments: number;
  netLiquidity: number;
  investmentsActive: number;
  obligations: number;
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso.slice(0,10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
};
const isExpected = (m: CashFlow): boolean => !["conciliado", "pagado", "cancelado", "borrador"].includes(m.status);

/** ¿El movimiento es REAL (conciliado o proveniente de ERP/importación)? */
export function isRealMovement(m: CashFlow): boolean {
  return m.status === "conciliado" || m.status === "pagado";
}

/** Saldo REAL consolidado: ingresos reales − egresos reales de los movimientos. */
export function realBalance(cashFlow: CashFlow[]): number {
  return cashFlow.reduce((acc, m) => {
    if (!isRealMovement(m)) return acc;
    return acc + (m.type === "income" ? m.amount : -m.amount);
  }, 0);
}

const sum = (items: { amount: number }[]): number =>
  items.reduce((acc, it) => acc + (Number.isFinite(it.amount) ? it.amount : 0), 0);

/** Opening balance: sum of accounting balances across bank accounts. */
export function openingBalance(accounts: BankAccount[]): number {
  return accounts.reduce(
    (acc, a) => acc + (Number.isFinite(a.balance) ? a.balance : 0),
    0,
  );
}

/** Movements of one type between two dates (inclusive). */
export function movementsBetween(
  cashFlow: CashFlow[],
  from: string,
  to: string,
  type?: CashFlow["type"],
  categories?: CashFlowCategory[],
): CashFlow[] {
  return cashFlow.filter(
    (m) =>
      m.date >= from &&
      m.date <= to &&
      (type === undefined || m.type === type) &&
      (categories === undefined || categories.length === 0 || categories.includes(m.category)),
  );
}

/** Daily projected cash: Saldo inicial + Ingresos - Egresos = Saldo proyectado. */
export function projectCashFlow(
  cashFlow: CashFlow[],
  accounts: BankAccount[],
  horizonDays = 30,
  from?: string,
): DailyProjection[] {
  const start = from ?? addDays(new Date().toISOString().slice(0, 10), 1);
  const startBalance = openingBalance(accounts);
  const dayMap = new Map<string, { income: number; expense: number }>();
  for (const m of cashFlow) {
    if (m.date < start || !isExpected(m)) continue;
    const entry = dayMap.get(m.date) ?? { income: 0, expense: 0 };
    if (m.type === "income") entry.income += m.amount;
    else entry.expense += m.amount;
    dayMap.set(m.date, entry);
  }

  const rows: DailyProjection[] = [];
  let running = startBalance;
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(start, i);
    const { income, expense } = dayMap.get(date) ?? { income: 0, expense: 0 };
    const initial = running;
    const final = initial + income - expense;
    rows.push({ date, initial, income, expense, final, variation: final - initial });
    running = final;
  }
  return rows;
}

/** Aggregate a daily projection into weekly or monthly buckets. */
export function aggregateProjection(
  rows: DailyProjection[],
  mode: "daily" | "weekly" | "monthly",
): DailyProjection[] {
  if (mode === "daily") return rows;
  const buckets = new Map<string, DailyProjection>();
  for (const r of rows) {
    const d = new Date(`${r.date}T00:00:00Z`);
    const monday = addDays(r.date, -((d.getUTCDay() + 6) % 7));
    const key = mode === "weekly" ? monday : r.date.slice(0, 7);
    const b = buckets.get(key) ?? {
      date: r.date,
      initial: r.initial,
      income: 0,
      expense: 0,
      final: 0,
      variation: 0,
    };
    b.income += r.income;
    b.expense += r.expense;
    b.final = r.final;
    b.variation = r.final - b.initial;
    buckets.set(key, b);
  }
  return Array.from(buckets.values());
}

/** Expected collections (recaudación) in the next N days. */
export function expectedCollections(cashFlow: CashFlow[], horizonDays = 30): number {
  const from = new Date().toISOString().slice(0, 10);
  const to = addDays(from, horizonDays);
  return sum(movementsBetween(cashFlow.filter(isExpected), from, to, "income", ["collection"]));
}

/** Expected payments (all expense categories) in the next N days. */
export function expectedPayments(cashFlow: CashFlow[], horizonDays = 30): number {
  const from = new Date().toISOString().slice(0, 10);
  const to = addDays(from, horizonDays);
  return sum(movementsBetween(cashFlow.filter(isExpected), from, to, "expense"));
}

/** Outstanding obligations (payments pending). */
export function obligationsProjected(cashFlow: CashFlow[], horizonDays = 30): number {
  return expectedPayments(cashFlow, horizonDays);
}

/** Active (non-rescued) investments total. */
export function activeInvestments(investments: Investment[]): number {
  return sum(investments.filter((i) => i.status !== "rescatada"));
}

/** Full liquidity picture used by the Dashboard KPIs. */
export function liquidityMetrics(
  accounts: BankAccount[],
  cashFlow: CashFlow[],
  investments: Investment[],
): LiquidityMetrics {
  const availableCash = openingBalance(accounts);
  const projection = projectCashFlow(cashFlow, accounts, 30);
  const projectedCash =
    projection.length > 0 ? projection[projection.length - 1].final : availableCash;
  const collections = expectedCollections(cashFlow, 30);
  const payments = expectedPayments(cashFlow, 30);
  const invested = activeInvestments(investments);
  const obligations = obligationsProjected(cashFlow, 30);
  return {
    availableCash,
    projectedCash,
    expectedCollections: collections,
    expectedPayments: payments,
    investmentsActive: invested,
    obligations,
    netLiquidity: availableCash + invested - obligations,
  };
}

/** Per-bank position: available, reconciled, difference, invested, status. */
export function bankPositions(
  banks: Bank[],
  accounts: BankAccount[],
  investments: Investment[],
): BankPosition[] {
  return banks.map((bank) => {
    const accountsOf = accounts.filter((a) => a.bankId === bank.id);
    const available = accountsOf.reduce((acc, a) => acc + a.balance, 0);
    const reconciled = accountsOf.reduce((acc, a) => acc + a.reconciledBalance, 0);
    const difference = reconciled - available;
    const invested = sum(
      investments.filter((i) => i.bankId === bank.id && i.status !== "rescatada"),
    );
    const hasDiff = accountsOf.some((a) => a.status === "revisar") || difference !== 0;
    return {
      bank,
      account: accountsOf[0],
      available,
      reconciled,
      difference,
      invested,
      status: hasDiff ? "revisar" : "activo",
    };
  });
}

/** Aging buckets for receivables: 0-30 / 31-60 / 61-90 / 90+. */
export function agingBuckets(invoices: Invoice[], todayISO: string): { bucket: string; amount: number }[] {
  const overdue = invoices.filter((i) => i.status !== "pagado" && i.dueDate < todayISO);
  const buckets = [
    { bucket: "1–30 días", amount: 0 },
    { bucket: "31–60 días", amount: 0 },
    { bucket: "61–90 días", amount: 0 },
    { bucket: "90+ días", amount: 0 },
  ];
  for (const inv of overdue) {
    const days = Math.round(
      (new Date(todayISO).getTime() - new Date(inv.dueDate).getTime()) / 86_400_000,
    );
    if (days <= 30) buckets[0].amount += inv.amount;
    else if (days <= 60) buckets[1].amount += inv.amount;
    else if (days <= 90) buckets[2].amount += inv.amount;
    else buckets[3].amount += inv.amount;
  }
  return buckets;
}

/** Receivables summary. */
export function receivablesSummary(
  invoices: Invoice[],
  todayISO: string,
): { total: number; overdue: number; upcoming: number; dueSoon: number } {
  const open = invoices.filter((i) => i.status !== "pagado");
  const overdue = open.filter((i) => i.dueDate < todayISO);
  const dueSoon = open.filter((i) => {
    const diff = Math.round(
      (new Date(i.dueDate).getTime() - new Date(todayISO).getTime()) / 86_400_000,
    );
    return diff >= 0 && diff <= 7;
  });
  const upcoming = open.filter(
    (i) => i.dueDate > addDays(todayISO, 7),
  );
  return {
    total: sum(open),
    overdue: sum(overdue),
    upcoming: sum(upcoming),
    dueSoon: sum(dueSoon),
  };
}

/** First date where projected balance goes negative (next cash deficit). */
export function nextDeficit(
  projection: DailyProjection[],
): { date: string; amount: number } | null {
  for (const p of projection) {
    if (p.final < 0) return { date: p.date, amount: p.final };
  }
  return null;
}

/** Deepest deficit within the projection window. */
export function deepestDeficit(
  projection: DailyProjection[],
): { date: string; amount: number } | null {
  let worst: { date: string; amount: number } | null = null;
  for (const p of projection) {
    if (p.final < 0 && (!worst || p.final < worst.amount)) {
      worst = { date: p.date, amount: p.final };
    }
  }
  return worst;
}

/** Upcoming payments derived from cash flow (supplier expenses ahead). */
export function derivePayments(cashFlow: CashFlow[]): Payment[] {
  const from = new Date().toISOString().slice(0, 10);
  return cashFlow
    .filter((m) => m.type === "expense" && m.category === "supplier" && m.date >= from && isExpected(m))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m, idx) => ({
      id: `pay-${m.id}`,
      supplier:
        m.description.split("—")[1]?.trim() ??
        m.description.replace(/^Pago proveedor\s*[-—]\s*/, "").trim(),
      dueDate: m.date,
      amount: m.amount,
      currency: m.currency,
      category: m.category,
      status: m.status,
    }));
}

/** Recent movements sorted by date desc (dashboard history table). */
export function recentMovements(cashFlow: CashFlow[], limit = 8): CashFlow[] {
  return [...cashFlow].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Investments sorted by maturity. */
export function investmentSchedule(investments: Investment[]): Investment[] {
  return [...investments].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

/** Per-bank reconciliation table rows. */
export function reconciliationRows(
  reconciliations: Reconciliation[],
  accounts: BankAccount[],
  banks: Bank[],
): (Reconciliation & { bankName: string; accountNumber: string })[] {
  return reconciliations.map((r) => {
    const acc = accounts.find((a) => a.id === r.bankAccountId);
    const bank = banks.find((b) => b.id === acc?.bankId);
    return {
      ...r,
      bankName: bank?.name ?? "—",
      accountNumber: acc?.accountNumber ?? "—",
    };
  });
}

/** Customer name lookup helper. */
export function customerName(customers: Customer[], id: string): string {
  return customers.find((c) => c.id === id)?.name ?? "—";
}
