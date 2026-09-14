import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { analyzeSheet, cellText, cellToDate, cellToNumber, detectHeaderRow, mapHeader } from "../src/import-engine/detect.ts";
import { parseWorkbook as readWorkbook, processWorkbook } from "../src/import-engine/pipeline.ts";
import { toCSV } from "../src/lib/export.ts";

const parseWorkbook = (buffer: ArrayBuffer) => readWorkbook(buffer, false);
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

// Change the XML inside a real workbook: writing an inflated !ref directly would
// make the fixture generator itself walk billions of empty coordinates.
function workbookWithSheetXml(transform: (xml: string) => string, bookType: "xlsx" | "xlsm" = "xlsx"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    headers, ["13/09/2026", "Cobro", 45000, 0, "BCI", "CLP"],
  ]), "Movimientos");
  const archive = XLSX.CFB.read(XLSX.write(wb, { type: "buffer", bookType }), { type: "buffer" });
  const name = "/xl/worksheets/sheet1.xml";
  const xml = Buffer.from(XLSX.CFB.find(archive, name).content).toString("utf8");
  XLSX.CFB.utils.cfb_add(archive, name, Buffer.from(transform(xml)));
  const bytes: Buffer = XLSX.CFB.write(archive, { type: "buffer", fileType: "zip", compression: true });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

for (const bookType of ["xlsx", "xlsm"] as const) test(`${bookType}: full Excel dimensions and styled empty cells do not require editing the file`, async () => {
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:XFD1048576"/>')
    .replace("</sheetData>", '<row r="1048576"><c r="XFD1048576" s="0"/></row></sheetData>'), bookType);
  const original = new Uint8Array(input).slice();
  const sheets = await parseWorkbook(input);
  const result = processWorkbook(sheets);
  assert.deepEqual(new Uint8Array(input), original);
  assert.equal(sheets[0].rows.length, 2);
  assert.equal(result.valid, 1);
  assert.equal(result.total, 1);
  assert.equal(result.records[0].row, 2);
  assert.equal(result.records[0].normalized.amount, 45000);
});

test("real data after a large blank gap retains its Excel row number", async () => {
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:F1048576"/>')
    .replace(/(<row r=")2(")/g, (_, before, after) => before + "1048576" + after)
    .replace(/(<c r="[A-F])2(")/g, (_, before, after) => before + "1048576" + after));
  const sheets = await parseWorkbook(input);
  assert.equal(sheets[0].rows.length, 2);
  const result = processWorkbook(sheets);
  assert.equal(result.valid, 1);
  assert.equal(result.records[0].row, 1048576);
});

test("columns beyond IV are read and keep their original column identities", async () => {
  const letters = ["IW", "IX", "IY", "IZ", "JA", "JB"];
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="IW1:JB2"/>')
    .replace(/(<c r=")([A-F])([12]")/g, (_, before, col, after) => before + letters[col.charCodeAt(0) - 65] + after));
  const result = processWorkbook(await parseWorkbook(input));
  assert.equal(result.valid, 1);
  assert.equal(result.sheets[0].columns.find((col) => col.key === "date")?.index, 256);
  assert.equal(result.records[0].raw["Debe [259]"], "45000");
});

test("manual header selection uses the original Excel row after blank rows", async () => {
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:F50002"/>')
    .replace(/(<row r=")([12])(")/g, (_, before, row, after) => before + (50000 + Number(row)) + after)
    .replace(/(<c r="[A-F])([12])(")/g, (_, before, row, after) => before + (50000 + Number(row)) + after));
  const sheets = await parseWorkbook(input);
  for (const overrides of [{}, { Movimientos: { headerIndex: 50001 } }]) {
    const result = processWorkbook(sheets, undefined, overrides);
    assert.equal(result.sheets[0].headerIndex, 50001);
    assert.equal(result.valid, 1);
    assert.equal(result.records[0].row, 50002);
  }
});

test("a real value in a distant column is preserved in trace data", async () => {
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:XFD2"/>')
    .replace(/(<row r="2"[^>]*>)([\s\S]*?)(<\/row>)/, '$1$2<c r="XFD2" t="str"><v>Referencia original</v></c>$3'));
  const result = processWorkbook(await parseWorkbook(input));
  assert.equal(result.valid, 1);
  assert.equal(result.records[0].raw["Columna 16384 [16384]"], "Referencia original");
});

test("format-only sheets are ignored even when their declared dimensions fill Excel", async () => {
  const input = workbookWithSheetXml((xml) => xml
    .replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:XFD1048576"/>')
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, '<sheetData><row r="1048576"><c r="XFD1048576" s="0"/></row></sheetData>'));
  assert.deepEqual(await parseWorkbook(input), []);
});

test("formula-only rows without cached results are reported instead of silently skipped", () => {
  const result = flow([headers, [undefined, undefined, { t: "n", f: "SUM(A1:A2)" }]]);
  assert.equal(result.total, 1);
  assert.equal(result.error, 1);
  assert.match(result.records[0].warnings, /no tiene resultado/);
});

test("xls: inflated BIFF dimensions do not make a small workbook exceed the reading area", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    headers, ["13/09/2026", "Cobro", 45000, 0, "BCI", "CLP"],
  ]), "Movimientos");
  const archive = XLSX.CFB.read(XLSX.write(wb, { type: "buffer", bookType: "xls" }), { type: "buffer" });
  const stream = Buffer.from(XLSX.CFB.find(archive, "/Workbook").content);
  let dimensionsUpdated = 0;
  for (let offset = 0; offset + 4 <= stream.length;) {
    const id = stream.readUInt16LE(offset), length = stream.readUInt16LE(offset + 2);
    if (id === 0x0200 && length === 14) {
      stream.writeUInt32LE(65536, offset + 8);
      stream.writeUInt16LE(256, offset + 14);
      dimensionsUpdated++;
    }
    offset += 4 + length;
  }
  assert.equal(dimensionsUpdated, 1);
  XLSX.CFB.utils.cfb_add(archive, "/Workbook", stream);
  const bytes: Buffer = XLSX.CFB.write(archive, { type: "buffer", fileType: "cfb" });
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const sheets = await parseWorkbook(input);
  assert.equal(sheets[0].rows.length, 2);
  assert.equal(processWorkbook(sheets).valid, 1);
});
