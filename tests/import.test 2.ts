import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { analyzeSheet, cellText, cellToDate, cellToNumber, detectHeaderRow, mapHeader } from "../src/import-engine/detect.ts";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline.ts";
import { toCSV } from "../src/lib/export.ts";

const flow = (rows: unknown[][]) => processWorkbook([{ name: "Movimientos", rows }]);
const headers = ["Fecha", "Descripción", "Debe", "Haber", "Banco", "Moneda"];
for (const [label, input, expected] of [
  ["native number", 45000, 45000], ["native decimal", 12.123, 12.123], ["CLP", "$ 1.234.567", 1234567],
  ["Chilean decimal", "1.234.567,89", 1234567.89], ["US decimal", "1,234,567.89", 1234567.89],
  ["zero", 0, 0], ["negative parentheses", "(12.500)", -12500], ["invalid text", "abc", null],
  ["bad grouping", "12.34.56", null], ["Excel error", {t:"e", v:7}, null],
] as const) test(`amount: ${label}`, () => assert.equal(cellToNumber(input), expected));

test("headers normalize accents, punctuation and spaces", () => { assert.equal(mapHeader("Fecha de emisión"), "issueDate"); assert.equal(mapHeader("Razón Social"), "customer"); assert.equal(mapHeader("N° de Cuenta"), "account"); });
test("numeric IDs in Excel date range are never converted into dates", () => assert.equal(cellText(45000), "45000"));
test("invalid dates are rejected without rollover or US guessing", () => { for (const v of ["31/02/2026", "12/31/2026", "2026-02-30", "1900-01-01"]) assert.equal(cellToDate(v).valid,false); assert.equal(cellToDate("13/09/2026").iso,"2026-09-13"); });
test("serial date systems 1900 and 1904", () => { assert.equal(cellToDate(45000).iso,"2023-03-15"); assert.equal(cellToDate({v:43538,date1904:true}).iso,"2023-03-15"); });
test("header detection requires two recognized columns", () => assert.equal(detectHeaderRow([["a","b","c","d","e","f"]]), -1));
test("zero on the unused side does not invalidate income/expense", () => { const s=flow([headers,["13/09/2026","Cobro",45000,0,"BCI","CLP"],["13/09/2026","Pago",0,30000,"BCI","CLP"]]); assert.equal(s.valid,2); assert.equal(s.records[1].normalized.amount,30000); assert.equal(s.records[1].normalized.type,"expense"); });
test("bank Cargo and Abono have their actual direction", () => { const s=flow([["Fecha","Glosa","Cargo","Abono"],["13/09/2026","Compra",30000,0],["13/09/2026","Depósito",0,45000]]); assert.equal(s.valid,2); assert.equal(s.records[0].normalized.type,"expense"); assert.equal(s.records[1].normalized.type,"income"); });
test("same amount/date in different accounts is not a duplicate", () => { const s=flow([[...headers,"Cuenta"],["13/09/2026","Cobro",45000,0,"BCI","CLP","1111"],["13/09/2026","Cobro",45000,0,"BCI","CLP","2222"],["13/09/2026","Cobro",45000,0,"BCI","CLP","1111"]]); assert.equal(s.valid,2); assert.equal(s.duplicate,1); });
test("customer import does not require an amount", () => { const s=processWorkbook([{name:"Clientes",rows:[["Razón social","RUT"],["Cliente A","12345678-K"],["Cliente B","87654321-0"]]}]); assert.equal(s.valid,2); assert.equal(s.duplicate,0); });
test("invoice issue date is normalized and missing client rejected", () => { const s=processWorkbook([{name:"Facturas",rows:[["Fecha de emisión","Fecha de vencimiento","Documento","Monto","Cliente"],["01/09/2026","15/09/2026",45000,35000,"Cliente A"],["01/09/2026","15/09/2026",45001,35000,""]]}]); assert.equal(s.valid,1); assert.equal(s.error,1); assert.equal(s.records[0].normalized.document,"45000"); });
test("unknown currency is not silently converted to CLP", () => { const s=flow([headers,["13/09/2026","Cobro",45000,0,"BCI","EUR"]]); assert.equal(s.error,1); });
test("both accounting sides populated require explicit correction", () => assert.equal(flow([headers,["13/09/2026","X",45000,30000,"BCI","CLP"]]).error,1));
test("manual sheet mapping handles arbitrary column names", () => { const s=processWorkbook([{name:"Hoja1",rows:[["Reporte"],["Día especial","Valor reportado","Detalle interno"],["13/09/2026",45000,"Cobro"]]}],undefined,{Hoja1:{headerIndex:2,entityType:"cash_flow",mapping:{date:0,amount:1,description:2}}}); assert.equal(s.records[0].normalized.amount,45000); assert.equal(s.records[0].row,3); assert.equal(s.warning,1); });
test("invalid rows do not suppress a later valid row as duplicate", () => { const s=flow([headers,["13/09/2026","Cobro",45000,0,"BCI","EUR"],["13/09/2026","Cobro",45000,0,"BCI","CLP"]]); assert.equal(s.error,1); assert.equal(s.valid,1); });
for (const bookType of ["xlsx","xlsm","xls"] as const) test(`${bookType}: actual workbook with one data row and original row offsets`, async () => {
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Reporte"],[],headers,[new Date(2026,8,13),"Cobro",45000,0,"BCI","CLP"]]),"Movimientos");
  const bytes=XLSX.write(wb,{type:"buffer",bookType}); const s=processWorkbook(await parseWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
  assert.equal(s.total,1); assert.equal(s.valid,1); assert.equal(s.records[0].row,4); assert.equal(s.records[0].normalized.date,"2026-09-13"); assert.equal(s.records[0].normalized.amount,45000);
});
test("one header plus one data row is retained", async () => { const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,["13/09/2026","Cobro",45000,0,"BCI","CLP"]]),"Movimientos"); const s=processWorkbook(await parseWorkbook(XLSX.write(wb,{type:"array",bookType:"xlsx"}))); assert.equal(s.valid,1); });
test("formula without cached result produces an actionable error", () => { const s=flow([headers,["13/09/2026","Cobro",{t:"n",f:"SUM(A1:A2)"},0,"BCI","CLP"]]); assert.match(s.records[0].warnings,/Recalcula/); });
test("unknown sheets cannot be reported as successfully imported", () => { const s=processWorkbook([{name:"extra",rows:[["Foo","Bar"],[1,2]]}]); assert.equal(s.valid+s.warning,0); assert.equal(s.error,1); });
test("text renamed as xlsx is rejected", async () => { await assert.rejects(parseWorkbook(new TextEncoder().encode("a,b\n1,2").buffer),/Excel válido/); });
test("CSV protects formula cells while keeping numeric negatives numeric", () => { const csv=toCSV([{Name:"=HYPERLINK(\"x\")",Amount:-12}]); assert.match(csv,/'=HYPERLINK/); assert.match(csv,/;-12/); });

test("ambiguous text separators respect the selected locale",()=>{ assert.equal(cellToNumber("1,234","en-US"),1234); assert.equal(cellToNumber("1,234","es-CL"),1.234); assert.equal(cellToNumber("1.234","en-US"),1.234); assert.equal(cellToNumber("1.234","es-CL"),1234); });
