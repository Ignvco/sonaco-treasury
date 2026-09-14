import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readSonacol, findBaseSheet } from "../src/import-engine/sonacol.ts";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline.ts";

// Synthetic data only; no client workbook or private records are bundled.
export function baseFixture() {
  const wb=XLSX.utils.book_new();
  const ws:XLSX.WorkSheet={"!ref":"A1:AE20"};
  XLSX.utils.book_append_sheet(wb,ws,"BASE");
  const put=(a:string,v:string|number)=>{ws[a]={t:typeof v==="number"?"n":"s",v};};
  for(const [c,v] of Object.entries({A:"TABLA ORIGEN",B:"EMPRESA",D:"FECHA",E:"CODIGO CTA",F:"DESCRIPCION CTA",G:"COMP",H:"RUT",I:"RAZON SOCIAL",K:"N DOCTO",L:"GLOSA",M:"VCTO REAL",N:"VCTO",O:"AJ VCTO",P:"DEBE",Q:"HABER",R:"REAL",S:"ESTADO",T:"CUENTA INFORME",U:"OPERACIÓN",AE:"CTA CTE"}))put(c+8,v);
  for(const r of [9,10])for(const [c,v] of Object.entries({A:"BANCO",B:"SONACOL",D:46276,E:511010007,F:"Banco B.C.I.",G:1,L:"Pago",P:0,Q:100,R:-100,S:"CONCILIADO",T:"511010007 Banco B.C.I.",U:"Proveedores"}))put(c+r,v);
  ws.D9.f="+BANCO!F19";ws.D10.f="+BANCO!F20";
  for(const [c,v] of Object.entries({A:"CLIENTES",B:"SONACOL",D:46265,E:511070004,H:"11111111-1",I:"Cliente de prueba",K:123,M:46279,N:46284,P:500,Q:0,R:500,S:"BCI",T:"511010007 Banco B.C.I.",AE:3}))put(c+11,v);
  for(const [c,v] of Object.entries({A:"COLOCACIONES",B:"SONACOL",D:46265,E:511030001,F:"Fondos Mutuos $",I:"BCI",M:46279,N:46279,P:1000,Q:0,R:1000,T:"511010016 Corpbanca"}))put(c+12,v);
  for(const [c,v] of Object.entries({A:"MANUAL",B:"SONACOL",D:46276,N:46279,O:46280,P:0,Q:200,R:-200,T:"511010007 Banco B.C.I.",U:"Proveedores"}))put(c+13,v);
  for(const [c,v] of Object.entries({A:"BANCO",D:0,E:0,P:0,Q:0,R:0,S:"CONCILIADO"}))put(c+14,v);
  ws.T14={t:"e",v:42};
  return wb;
}
const analyze=(wb:XLSX.WorkBook)=>processWorkbook(readSonacol(wb));
test("BASE only: all entity types come from BASE and its own physical row numbers",()=>{
  const s=analyze(baseFixture());assert.equal(s.total,5);assert.equal(s.error,0);assert.equal(s.duplicate,0);assert.deepEqual(s.sheets.map(s=>s.name),["BASE"]);
  assert.deepEqual(s.records.map(r=>r.entityType),["cash_flow","cash_flow","invoice","investment","projection"]);
  assert.deepEqual(s.records.map(r=>r.row),[9,10,11,12,13]);assert.equal(s.sheets[0].headerIndex,8);
  assert.equal(s.records[2].normalized.dueDate,"2026-09-14");assert.equal(s.records[2].normalized.reportDate,"2026-09-19");
  assert.equal(s.records[2].normalized.account,null);assert.equal(s.records[2].normalized.document,"123");
  assert.equal(s.records[3].normalized.bank,"Banco BCI");assert.equal(s.records[3].normalized.settlementBank,"Corpbanca");
  assert.equal(s.records[4].normalized.date,"2026-09-15");
});
test("BASE only: equal ledger postings retain stable multiplicity",()=>{
  const a=analyze(baseFixture()),b=analyze(baseFixture());
  assert.notEqual(a.records[0].dedupeKey,a.records[1].dedupeKey);
  assert.deepEqual(a.records.map(r=>r.dedupeKey),b.records.map(r=>r.dedupeKey));
  assert.equal(a.records[0].normalized.legacySheet,"BANCO");assert.equal(a.records[0].normalized.legacyRow,19);
});
test("BASE only: errors and uncached formulas in money cells are reported",()=>{
  const wb=baseFixture();wb.Sheets.BASE.P9={t:"e",v:42};wb.Sheets.BASE.P10={t:"n",f:"BANCO!Z20"};
  const s=analyze(wb);assert.equal(s.error,2);assert.match(s.records[1].warnings,/no tiene resultado guardado/);
});
test("BASE only: wrong REAL value is rejected and original USD is preserved",()=>{
  const wb=baseFixture();wb.Sheets.BASE.R9.v=-99;wb.Sheets.BASE.F10.v="Banco BCI US$";
  const s=analyze(wb);assert.equal(s.records[0].status,"ERROR");assert.match(s.records[0].warnings,/REAL/);assert.equal(s.records[1].normalized.currency,"USD");
});
test("BASE only: missing or ambiguous BASE never falls back to other worksheets",async()=>{
  assert.throws(()=>findBaseSheet(["BASE"," base "]),/más de una/);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Fecha","Monto"],[46276,50]]),"MACRO BANCO");
  await assert.rejects(parseWorkbook(XLSX.write(wb,{type:"array",bookType:"xlsx"})),/No se encontró la hoja BASE/);
});
test("BASE only: other worksheet objects are never accessed even when formulas reference them",()=>{
  const wb=baseFixture();
  for(const name of ["MACRO BANCO","MACRO BANCOS","MACRO CLIENTES","PARAMETROS","BANCO","CLIENTES","COLOCACIONES","PROYEC","INVERSIONES"]){
    wb.SheetNames.push(name);Object.defineProperty(wb.Sheets,name,{get(){throw new Error("Forbidden sheet read: "+name);},enumerable:true});
  }
  assert.equal(analyze(wb).total,5);
});
for(const bookType of ["xlsx","xlsm","xls"] as const)test(`BASE only: ${bookType} reads a standalone BASE without requiring any other tab`,async()=>{
  const s=processWorkbook(await parseWorkbook(XLSX.write(baseFixture(),{type:"array",bookType})));
  assert.equal(s.total,5);assert.equal(s.error,0);assert.equal(s.sheets.length,1);
});
test("BASE only: huge error ranges in excluded sheets do not enter the parser result",async()=>{
  const wb=baseFixture();
  for(const name of ["MACRO BANCO","MACRO CLIENTES","PARAMETROS"]) XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["ignore"]]),name);
  const archive=XLSX.CFB.read(XLSX.write(wb,{type:"buffer",bookType:"xlsm"}),{type:"buffer"});
  for(const i of [2,3,4]) {
    const path=`/xl/worksheets/sheet${i}.xml`,xml=Buffer.from(XLSX.CFB.find(archive,path).content).toString();
    XLSX.CFB.utils.cfb_add(archive,path,Buffer.from(xml.replace(/<dimension ref="[^"]+"\s*\/>/,'<dimension ref="A1:XFD1048576"/>').replace("</sheetData>",'<row r="1048576"><c r="A1048576" t="e"><v>#N/A</v></c></row></sheetData>')));
  }
  const bytes:Buffer=XLSX.CFB.write(archive,{type:"buffer",fileType:"zip",compression:true}),original=Buffer.from(bytes);
  const s=processWorkbook(await parseWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
  assert.equal(s.total,5);assert.deepEqual(s.sheets.map(s=>s.name),["BASE"]);assert.deepEqual(bytes,original);
});
