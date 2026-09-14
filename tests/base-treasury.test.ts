import assert from "node:assert/strict";
import { test } from "node:test";
import { baseTreasury, type TreasuryRow } from "../src/financial-engine/base-treasury";
const row=(changes:Partial<TreasuryRow>={}):TreasuryRow=>({id:"1",kind:"cash_flow",origin:"BANCO",amount:1000,currency:"CLP",type:"income",status:"conciliado",date:"2026-09-11",plannedDate:"2026-09-11",bank:"A",ledger:"01",description:"Test",document:"",customer:"",interest:0,cutoff:"2026-09-12",fileName:"test.xlsx",row:9,recordId:"trace",...changes});
test("BASE REAL: literal total retains the cents; native currency filter stays separate",()=>{
 const data=[row({amount:14456115}),row({id:"usd",amount:1597.22,currency:"USD"}),row({id:"client",kind:"invoice",origin:"CLIENTES",amount:700,plannedDate:"2026-09-15"})];
 const m=baseTreasury(data,[],"2026-09-12");
 assert.equal(m.available,14457712.22);assert.equal(Math.round(m.available),14457712);
 assert.equal(baseTreasury(data,[],"2026-09-12",30,"CLP").available,14456115);
 assert.equal(m.positions.reduce((s,p)=>s+p.amount,0),m.available);
});
test("forecast combines customers, maturities and manual payments, respecting settled states",()=>{
 const data=[row(),row({id:"i",kind:"invoice",origin:"CLIENTES",amount:100,plannedDate:"2026-09-15"}),
 row({id:"v",kind:"investment",origin:"COLOCACIONES",amount:200,interest:5,plannedDate:"2026-09-20"}),
 row({id:"p",kind:"projection",origin:"MANUAL",amount:40,type:"expense",plannedDate:"2026-09-13"}),
 row({id:"paid",kind:"invoice",origin:"CLIENTES",amount:999,status:"pagado"})];
 assert.equal(baseTreasury(data,[],"2026-09-12",7).projected,1060);
 assert.equal(baseTreasury(data,[],"2026-09-12",15).projected,1265);
 assert.equal(baseTreasury(data,[],"2026-09-12",30).projected,1265);
});
test("explicit links count a collection once; equal unrelated amounts remain distinct",()=>{
 const data=[row(),row({id:"i",kind:"invoice",origin:"CLIENTES",amount:100,plannedDate:"2026-09-15"}),
 row({id:"p",kind:"projection",origin:"MANUAL",amount:100,plannedDate:"2026-09-17"})];
 assert.equal(baseTreasury(data,[],"2026-09-12").collections,200);
 const link={id:"link",projection_id:"p",target_kind:"invoice",target_id:"i"};
 const m=baseTreasury(data,[link],"2026-09-12");assert.equal(m.collections,100);assert.equal(m.events[0].effectiveDate,"2026-09-17");
 const changed=data.map(r=>r.id==="i"?{...r,amount:120}:r);const reviewed=baseTreasury(changed,[link],"2026-09-12");
 assert.equal(reviewed.collections,120);assert.equal(reviewed.issues.length,1);
});
test("cash is cut off by date; overdue unsettled items carry an explicit flag",()=>{
 const data=[row(),row({id:"future",amount:500,date:"2026-09-20"}),row({id:"overdue",kind:"invoice",origin:"CLIENTES",amount:30,plannedDate:"2026-09-01"})];
 const m=baseTreasury(data,[],"2026-09-12");assert.equal(m.available,1000);assert.equal(m.overdue.length,1);assert.equal(m.events[0].effectiveDate,"2026-09-13");
 assert.equal(m.projected,m.available+m.collections-m.payments);
});
test("latest trace of the same entity does not multiply its financial value",()=>{
 assert.equal(baseTreasury([row(),row()],[],"2026-09-12").available,1000);
});
