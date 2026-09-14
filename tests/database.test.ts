import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const db = new PGlite();
const writer="10000000-0000-0000-0000-000000000001", reader="10000000-0000-0000-0000-000000000002";
const base={entityType:"cash_flow", status:"VALID",sheet:"Movimientos",row:2,warnings:"",raw:{Fecha:"13/09/2026"},normalized:{type:"income",date:"2026-09-13",issueDate:"2026-09-13",amount:45000,currency:"CLP",description:"Cobro",bank:"Banco BCI",account:"0012345678",category:"collection"}};
const row=(overrides:Record<string,unknown>={})=>({...structuredClone(base),normalized:{...base.normalized,...overrides}});
const hash=(name:string)=>createHash("sha256").update(name).digest("hex");
async function run(name:string,rows:unknown[]){return (await db.query<{result:Record<string,unknown>}>("select public.import_treasury_records($1,$2,$3::jsonb) as result",[name,hash(name),JSON.stringify(rows)])).rows[0].result;}
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const file of ["20260913024822000_schema_v1.sql","20260913062654000_data_platform_v2.sql","20260914000000000_import_integrity.sql","20260914010000000_sonacol_workbook.sql","20260914020000000_base_only_import.sql","20260914030000000_base_treasury_v6.sql"]){
    let sql=await readFile(`supabase/migrations/${file}`,"utf8");
    sql=sql.replace(/^alter publication.*$/gm,""); // PGlite has no replication; unrelated to import SQL.
    await db.exec(sql);
  }
  await db.exec(`insert into auth.users values('${writer}','writer@example.test','{"name":"Tesorería"}'),('${reader}','reader@example.test','{"name":"Consulta"}');
    update public.profiles set role='tesoreria' where id='${writer}';
    grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
    set role authenticated; set request.jwt.claim.sub='${writer}';`);
});
after(()=>db.close());
test("database: successful rows are linked and batch is complete",async()=>{const b=await run("a.xlsx",[row()]);assert.equal(b.status,"completed");assert.equal(b.imported_records,1);const r=await db.query("select * from import_records where import_batch_id=$1",[b.id]);assert.ok(r.rows[0].entity_id);assert.equal(r.rows[0].status,"VALID");});
test("database: repeat requests return the same batch without extra writes",async()=>{const a=await run("a.xlsx",[row()]);const b=await run("a.xlsx",[row()]);assert.equal(a.id,b.id);const count=await db.query<{n:number}>("select count(*)::int as n from cash_flow");assert.equal(count.rows[0].n,1);});
test("database: same row in a different workbook is duplicate",async()=>{const b=await run("b.xlsx",[row()]);assert.equal(b.duplicate_records,1);assert.equal(b.imported_records,0);});
test("database: amount/date in a different account remains distinct",async()=>{const b=await run("c.xlsx",[row({account:"0098765432"})]);assert.equal(b.imported_records,1);});
test("database: actual failures count as errors and roll back related rows",async()=>{const bad=row({date:"2026-02-30",bank:"Do not create"});const good=row({description:"Second valid"});const b=await run("partial.xlsx",[bad,good]);assert.equal(b.status,"partial");assert.equal(b.error_records,1);assert.equal(b.imported_records,1);assert.equal((await db.query("select * from banks where name='Do not create'")).rows.length,0);});
test("database: invoice creates its own customer, never arbitrary first customer",async()=>{const r={...row(),entityType:"invoice",normalized:{customer:"Correct customer",rut:"12345678-K",document:"45000",issueDate:"2026-09-01",dueDate:"2026-09-30",amount:45000,currency:"CLP"}};const b=await run("invoice.xlsx",[r]);assert.equal(b.imported_records,1);const result=await db.query("select c.name from invoices i join customers c on c.id=i.customer_id where document='45000'");assert.equal(result.rows[0].name,"Correct customer");});
test("database: missing customer fails without creating an unrelated invoice",async()=>{const r={...row(),entityType:"invoice",normalized:{document:"MISSING",issueDate:"2026-09-01",dueDate:"2026-09-30",amount:4000,currency:"CLP"}};const b=await run("badinvoice.xlsx",[r]);assert.equal(b.status,"failed");assert.equal(b.imported_records,0);});
test("database: RUT check digit K does not collapse into a numeric check digit",async()=>{const records=["12345678-K","12345678-0"].map((rut,i)=>({...row(),entityType:"customer",row:i+2,normalized:{customer:"Client "+i,rut}}));const b=await run("customers.xlsx",records);assert.equal(b.imported_records,2);});
test("database: trace failure rolls back the entire request",async()=>{await assert.rejects(run("rollback.xlsx",[{...row({description:"Must rollback"}),row:"bad"}]));assert.equal((await db.query("select * from cash_flow where description='Must rollback'")).rows.length,0);assert.equal((await db.query("select * from import_batches where file_name='rollback.xlsx'")).rows.length,0);});
test("database: read-only role cannot import or self-promote",async()=>{await db.exec(`set request.jwt.claim.sub='${reader}'`);await assert.rejects(run("forbidden.xlsx",[row()]),/rol no permite/);await assert.rejects(db.exec(`update profiles set role='administrador' where id='${reader}'`),/administrador/);await db.exec(`set request.jwt.claim.sub='${writer}'`);});
test("database: new registrations default to consulta",async()=>{const r=await db.query("select role from profiles where id=$1",[reader]);assert.equal(r.rows[0].role,"consulta");});

test("database: ledger source identity preserves equal postings and deduplicates a later file",async()=>{
  const records=[1,2].map(i=>row({description:"Repeated ledger posting",sourceId:`ledger:occurrence:${i}`}));
  const first=await run("repeated-ledger.xlsx",records),second=await run("repeated-ledger-next.xlsx",records);
  assert.equal(first.imported_records,2);assert.equal(second.imported_records,0);assert.equal(second.duplicate_records,2);
});
const account=(changes:Record<string,unknown>={})=>({...row(),entityType:"bank_account",normalized:{bank:"Snapshot bank",ledgerCode:"TEST001",account:null,date:"2026-09-12",balance:500,reconciledBalance:500,currency:"CLP",...changes}});
test("database: account snapshots create real balances without inventing account numbers",async()=>{
  const batch=await run("snapshot.xlsx",[account()]);assert.equal(batch.imported_records,1);
  const r=(await db.query("select * from bank_accounts where ledger_code='TEST001'")).rows[0];
  assert.equal(Number(r.balance),500);assert.equal(r.account_number,null);
});
test("database: newer account snapshot updates once; stale and conflicting snapshots preserve it",async()=>{
  assert.equal((await run("snapshot-new.xlsx",[account({date:"2026-09-13",balance:600})])).imported_records,1);
  assert.equal((await run("snapshot-stale.xlsx",[account({date:"2026-09-11",balance:300})])).error_records,1);
  assert.equal((await run("snapshot-conflict.xlsx",[account({date:"2026-09-13",balance:700})])).error_records,1);
  const r=(await db.query("select * from bank_accounts where ledger_code='TEST001'")).rows;
  assert.equal(r.length,1);assert.equal(Number(r[0].balance),600);
});
test("database: seeded Success history is explicitly unverified; deleted entities stop counting",async()=>{
  const status=async()=> (await db.query<{s:{records:number;history:{verified:boolean;status:string}[]}}>("select get_excel_import_status() s")).rows[0].s;
  const before=await status();assert.ok(before.history.some(h=>h.status==="Unverified"&&!h.verified));
  const b=await run("metrics.xlsx",[row({description:"Metrics entity"})]);assert.equal(b.imported_records,1);
  const loaded=await status();assert.equal(Number(loaded.records),Number(before.records)+1);
  await db.exec("delete from cash_flow where description='Metrics entity'");
  const deleted=await status();assert.equal(deleted.records,before.records);assert.ok(deleted.history.some(h=>h.verified&&h.status==="Warning"));
});

test("database: BASE upgrade recognizes a verified row from the preceding importer",async()=>{
  const old={...row({description:"Legacy BASE bridge"}),sheet:"BANCO",row:99};
  assert.equal((await run("old-format.xlsx",[old])).imported_records,1);
  const next={...row({description:"Legacy BASE bridge",account:null,sourceId:"BASE:bridge:1",sourceProfile:"BASE-ONLY-test",legacySheet:"BANCO",legacyRow:99}),sheet:"BASE",row:89};
  const result=await run("base-upgrade.xlsx",[next]);assert.equal(result.imported_records,0);assert.equal(result.duplicate_records,1);
  assert.equal((await db.query("select count(*)::int n from cash_flow where description='Legacy BASE bridge'")).rows[0].n,1);
});
test("database: BASE bridge does not match a changed amount at the same old row",async()=>{
  const next={...row({description:"Legacy BASE bridge",amount:44000,sourceId:"BASE:bridge:changed",sourceProfile:"BASE-ONLY-test",legacySheet:"BANCO",legacyRow:99}),sheet:"BASE",row:89};
  assert.equal((await run("base-new-amount.xlsx",[next])).imported_records,1);
});

const baseRow=(changes:Record<string,unknown>={},kind="cash_flow",index=9)=>{
 const n={entityType:kind,sourceProfile:"BASE-ONLY-test",sourceOrigin:kind==="cash_flow"?"BANCO":kind==="invoice"?"CLIENTES":"MANUAL",company:"TEST",voucher:String(changes.description??"BASE daily test"),ledgerCode:"TEST-LEDGER",bank:"BASE Test Bank",currency:"CLP",type:"income",amount:1200,date:"2026-09-10",description:"BASE daily test",...changes};
 return {...row(),sheet:"BASE",row:index,entityType:kind,normalized:{...n,sourceId:JSON.stringify(n)+":"+index},raw:{["R"+index]:{value:n.amount}}};
};
const compareBase=async(rows:unknown[]) => (await db.query<{result:{revision:string;rows:{row:number;change:string;entityId:string}[]}}>("select compare_base_import($1::jsonb) result",[JSON.stringify(rows)])).rows[0].result;
const applyBase=async(name:string,rows:unknown[],revision:string,selected:number[]=[]) => (await db.query<{result:Record<string,unknown>}>("select import_base_changes($1,$2,$3::jsonb,$4,$5::int[]) result",[name,hash(name),JSON.stringify(rows),revision,selected])).rows[0].result;
test("BASE v6: first upload and repeat preserve entity IDs and native totals",async()=>{
 const r=baseRow();const plan=await compareBase([r]);assert.equal(plan.rows[0].change,"new");
 const saved=await applyBase("v6-first.xlsx",[r],plan.revision);assert.equal(saved.imported_records,1);
 const again=await compareBase([r]);assert.equal(again.rows[0].change,"unchanged");
 const repeated=await applyBase("v6-repeat.xlsx",[r],again.revision);assert.equal(repeated.imported_records,0);assert.equal(repeated.duplicate_records,1);
 const traces=await db.query("select * from base_current_records where entity_id=$1",[again.rows[0].entityId]);assert.equal(traces.rows.length,1);assert.equal(traces.rows[0].source_row,9);
});
test("BASE v6: invoice amount and due date update in place only after selection",async()=>{
 const fields={customer:"BASE Invoice Client",rut:"11222333-K",document:"V6-001",issueDate:"2026-09-01",dueDate:"2026-09-20",reportDate:"2026-09-25"};
 const original=baseRow(fields,"invoice",5767),first=await compareBase([original]);await applyBase("v6-invoice.xlsx",[original],first.revision);
 const changed=baseRow({...fields,amount:1800,dueDate:"2026-09-21",reportDate:"2026-09-26"},"invoice",5767);
 const plan=await compareBase([changed]);assert.equal(plan.rows[0].change,"modified");const id=plan.rows[0].entityId;
 const skip=await applyBase("v6-invoice-skip.xlsx",[changed],plan.revision,[]);assert.equal(skip.imported_records,0);
 const fresh=await compareBase([changed]);await applyBase("v6-invoice-update.xlsx",[changed],fresh.revision,[5767]);
 // Compare the stored calendar date explicitly; PGlite returns DATE columns as Date objects.
 const invoice=(await db.query("select amount, to_char(due_date, 'YYYY-MM-DD') as due_date from invoices where id=$1",[id])).rows[0];assert.equal(Number(invoice.amount),1800);assert.equal(invoice.due_date,"2026-09-21");
 assert.equal((await compareBase([changed])).rows[0].change,"unchanged");
 assert.equal((await db.query("select count(*)::int n from invoices where document='V6-001'")).rows[0].n,1);
});
test("BASE v6: stale preview cannot overwrite another edit",async()=>{
 const r=baseRow({description:"CAS test"}),first=await compareBase([r]);await applyBase("v6-cas.xlsx",[r],first.revision);
 const changed=baseRow({description:"CAS test",amount:1500}),plan=await compareBase([changed]);
 await db.query("update cash_flow set amount=1300 where id=$1",[plan.rows[0].entityId]);
 await assert.rejects(applyBase("v6-cas-stale.xlsx",[changed],plan.revision,[9]),/cambiaron/);
 assert.equal((await db.query("select * from import_batches where file_name='v6-cas-stale.xlsx'")).rows.length,0);
});
test("BASE v6: equal postings stay distinct; ambiguous edits are not guessed",async()=>{
 const records=[10,11].map(i=>baseRow({description:"Equal postings v6"}, "cash_flow",i));
 const first=await compareBase(records);await applyBase("v6-equal.xlsx",records,first.revision);
 const same=await compareBase(records);assert.deepEqual(same.rows.map(r=>r.change),["unchanged","unchanged"]);
 const changed=[10,11].map(i=>baseRow({description:"Equal postings v6",amount:1400},"cash_flow",i));
 const plan=await compareBase(changed);assert.deepEqual(plan.rows.map(r=>r.change),["conflict","conflict"]);
 const applied=await applyBase("v6-ambiguous.xlsx",changed,plan.revision,[10,11]);assert.equal(applied.imported_records,0);assert.equal(applied.error_records,2);
});
test("BASE v6: consultation users cannot apply changes",async()=>{
 const records=[baseRow({description:"Read only v6"})];
 await db.exec(`set request.jwt.claim.sub='${reader}'`);
 try{const p=await compareBase(records);await assert.rejects(applyBase("v6-forbidden.xlsx",records,p.revision),/rol no permite/);}
 finally{await db.exec(`set request.jwt.claim.sub='${writer}'`);}
});

test("BASE v6: matching identical rows first permits one corrected posting regardless of row order",async()=>{
 const a=baseRow({description:"First posting",ledgerCode:"SAME-DAY",voucher:"ORDER-SAME"},"cash_flow",28);
 const b=baseRow({description:"Second posting",ledgerCode:"SAME-DAY",voucher:"ORDER-SAME",amount:1600},"cash_flow",29);
 const first=await compareBase([a,b]);await applyBase("v6-order-first.xlsx",[a,b],first.revision);
 const changed=baseRow({description:"Corrected first posting",ledgerCode:"SAME-DAY",voucher:"ORDER-SAME",amount:1300},"cash_flow",28);
 const plan=await compareBase([changed,b]);assert.deepEqual(plan.rows.map(r=>r.change),["modified","unchanged"]);
 const result=await applyBase("v6-order-update.xlsx",[changed,b],plan.revision,[28]);assert.equal(result.imported_records,1);
 assert.equal((await db.query("select count(*)::int n from base_current_records where normalized_json->>'ledgerCode'='SAME-DAY'")).rows[0].n,2);
});

test("BASE v6: snapshot membership follows the last accepted workbook without deleting history",async()=>{
 const a=baseRow({description:"Snapshot retained",ledgerCode:"SNAP-A"},"cash_flow",80);
 const b=baseRow({description:"Snapshot absent",ledgerCode:"SNAP-B"},"cash_flow",81);
 const first=await compareBase([a,b]);await applyBase("v6-membership-first.xlsx",[a,b],first.revision);
 const second=await compareBase([a]);await applyBase("v6-membership-next.xlsx",[a],second.revision);
 const snapshot=(await db.query<{s:{traces:{entity_id:string;in_latest:boolean;current_normalized:{description:string}}[]}}>("select get_base_treasury_snapshot() s")).rows[0].s;
 assert.equal(snapshot.traces.find(r=>r.current_normalized.description==="Snapshot retained")?.in_latest,true);
 const absent=snapshot.traces.find(r=>r.current_normalized.description==="Snapshot absent");assert.equal(absent?.in_latest,false);
 assert.equal((await db.query("select count(*)::int n from cash_flow where id=$1",[absent?.entity_id])).rows[0].n,1);
});
