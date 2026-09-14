/** Treasury calculations use BASE's signed REAL values and native currencies. */
export interface TreasuryRow {
  id: string; kind: "cash_flow" | "invoice" | "investment" | "projection";
  origin: string; amount: number; currency: string; type: string; status: string;
  date: string; plannedDate: string; bank: string; ledger: string; description: string;
  document: string; customer: string; interest: number; cutoff: string;
  fileName: string; row: number | null; recordId: string | null;
}
export interface ForecastLink { id: string; projection_id: string; target_kind: string; target_id: string; }
export interface ForecastEvent extends TreasuryRow { effectiveDate: string; overdue: boolean; signed: number; replaces?: string; }
export const total = (values: number[]) => values.reduce((sum, n) => sum + Math.round(n * 100), 0) / 100;
export const nextDate = (date: string, days: number) => {
  const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export const sourceKey = (r: Pick<TreasuryRow, "kind" | "id">) => r.kind + ":" + r.id;
export function baseTreasury(input: TreasuryRow[], links: ForecastLink[], cutoff: string, horizon = 30, currency = "BASE", bank = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || ![7,15,30].includes(horizon)) throw new Error("Fecha u horizonte inválidos.");
  const rows = [...new Map(input.map(r => [sourceKey(r), r])).values()];
  const matches = (r: TreasuryRow) => (currency === "BASE" || r.currency === currency) && (!bank || r.bank === bank);
  const sign = (r: TreasuryRow) => r.type === "expense" ? -r.amount : r.amount;
  const cashRows = rows.filter(r => r.kind === "cash_flow" && r.origin === "BANCO" && r.date <= cutoff && matches(r));
  const allFuture = rows.filter(r => r.kind !== "cash_flow" && !["pagado","rescatada","cancelado","borrador"].includes(r.status));
  const byKey = new Map(rows.map(r => [sourceKey(r), r]));
  const suppressed = new Set<string>();
  const replacement = new Map<string,string>();
  const issues: string[] = [];
  for (const link of links) {
    const projectionKey = "projection:" + link.projection_id, targetKey = link.target_kind + ":" + link.target_id;
    const p = byKey.get(projectionKey), target = byKey.get(targetKey);
    if (!p) continue;
    if (!target || p.currency !== target.currency || p.type !== "income" || Math.abs(p.amount - target.amount - target.interest) > 0.005) {
      suppressed.add(projectionKey);
      issues.push("Revisar vínculo de " + p.description + ": cambió el registro relacionado. La proyección vinculada queda fuera del total hasta corregir el vínculo.");
    } else if (["pagado","rescatada"].includes(target.status)) {
      suppressed.add(projectionKey);
    } else if (!["cancelado","borrador"].includes(p.status)) {
      suppressed.add(targetKey); replacement.set(projectionKey, targetKey);
    }
  }
  const events: ForecastEvent[] = allFuture.filter(r => !suppressed.has(sourceKey(r))).map(r => ({
    ...r, effectiveDate: r.plannedDate <= cutoff ? nextDate(cutoff, 1) : r.plannedDate,
    overdue: r.plannedDate <= cutoff, signed: sign(r) + r.interest, replaces: replacement.get(sourceKey(r)),
  })).filter(r => matches(r) && r.effectiveDate <= nextDate(cutoff, horizon)).sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const available = total(cashRows.map(sign));
  const days = Array.from({length:horizon}, (_,i) => {
    const date = nextDate(cutoff,i+1), movements = events.filter(r => r.effectiveDate === date);
    return {date, income:total(movements.filter(r=>r.signed>0).map(r=>r.signed)), expense:total(movements.filter(r=>r.signed<0).map(r=>-r.signed)),
      balance:total([available,...events.filter(r=>r.effectiveDate<=date).map(r=>r.signed)])};
  });
  const positions = [...new Set(cashRows.map(r=>r.bank+"|"+r.ledger+"|"+r.currency))].map(key=>{
    const items = cashRows.filter(r=>r.bank+"|"+r.ledger+"|"+r.currency===key);
    return {key,bank:items[0].bank,ledger:items[0].ledger,currency:items[0].currency,amount:total(items.map(sign)),rows:items};
  }).sort((a,b)=>b.amount-a.amount);
  const collectionRows = events.filter(r=>r.signed>0), paymentRows=events.filter(r=>r.signed<0);
  const investedRows = rows.filter(r=>r.kind==="investment" && !["rescatada","cancelado"].includes(r.status) && matches(r));
  return {available,cashRows,events,days,positions,collectionRows,paymentRows,investedRows,
    collections:total(collectionRows.map(r=>r.signed)),payments:total(paymentRows.map(r=>-r.signed)),
    invested:total(investedRows.map(r=>r.amount)),projected:days.at(-1)?.balance??available,
    overdue:events.filter(r=>r.overdue),issues,minimum:Math.min(available,...days.map(r=>r.balance))};
}
