import test from "node:test";
import assert from "node:assert/strict";
import { aggregateProjection, projectCashFlow, receivablesSummary, realBalance } from "../src/financial-engine/calculations.ts";
import { formatDateMedium } from "../src/financial-engine/format.ts";
import type { BankAccount, CashFlow, Invoice } from "../src/financial-engine/types.ts";
const account={balance:1000} as BankAccount;
const movement=(date:string,amount:number,status="programado") => ({id:date,date,amount,type:"income",status,currency:"CLP"}) as CashFlow;
test("weekly buckets keep initial balance and do not merge months", () => { const daily=projectCashFlow([movement("2026-01-01",10)], [account], 65,"2026-01-01"); const weekly=aggregateProjection(daily,"weekly"); assert.equal(weekly[0].initial,1000); assert.equal(weekly[0].variation,10); assert.equal(weekly.at(-1)?.final,1010); assert.ok(weekly.length>=10); });
test("monthly variation is final minus opening", () => { const rows=aggregateProjection(projectCashFlow([movement("2026-09-13",500)], [account],30,"2026-09-01"),"monthly"); assert.deepEqual([rows[0].initial,rows[0].final,rows[0].variation],[1000,1500,500]); });
test("settled/cancelled/draft movements do not double count in projections", () => { const rows=projectCashFlow([movement("2026-09-13",500,"conciliado"),movement("2026-09-13",600,"cancelado"),movement("2026-09-13",700,"borrador"),movement("2026-09-13",50)], [account],1,"2026-09-13"); assert.equal(rows[0].final,1050); });
test("receivable buckets are disjoint regardless of row order", () => { const invoices=[{dueDate:"2026-09-18",amount:20},{dueDate:"2026-09-15",amount:30},{dueDate:"2026-10-01",amount:40},{dueDate:"2026-09-01",amount:10}].map((r)=>({...r,status:"por_vencer"})) as Invoice[]; assert.deepEqual(receivablesSummary(invoices,"2026-09-13"),{total:100,overdue:10,dueSoon:50,upcoming:40}); });
test("import origin alone does not make a projected row settled",()=>assert.equal(realBalance([{...movement("2026-09-13",500),origin:"excel"}]),0));
test("date-only display retains the calendar day in Chile",()=>assert.match(formatDateMedium("2026-09-13"),/^13/));

import { amountInClp } from "../src/financial-engine/currency.ts";
test("mixed-currency totals use CLP equivalents",()=>assert.equal(amountInClp(1000,"USD",{USD:950})+amountInClp(1000,"CLP",{}),951000));
test("missing FX never assumes CLP or a fictional rate",()=>assert.throws(()=>amountInClp(1000,"EUR",{}),/Falta una tasa/));
