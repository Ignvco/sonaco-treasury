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
  for(const file of ["20260913024822000_schema_v1.sql","20260913062654000_data_platform_v2.sql","20260914000000000_import_integrity.sql"]){
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
