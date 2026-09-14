import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline.ts";
import { total } from "../src/financial-engine/base-treasury.ts";
const [path,expected]=process.argv.slice(2);
if(!path)throw new Error("Indica la ruta del Excel original; opcionalmente añade la suma esperada con punto decimal.");
const bytes=await readFile(path),hash=createHash("sha256").update(bytes).digest("hex");
const summary=processWorkbook(await parseWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
assert.ok(summary.records.every(r=>r.sheet.trim().toUpperCase()==="BASE"),"Solo se permite BASE.");
assert.equal(summary.error,0,"Hay errores que revisar en las filas de BASE.");
const bank=summary.records.filter(r=>r.normalized.sourceOrigin==="BANCO");
const available=total(bank.map(r=>Number(r.normalized.amount)*(r.normalized.type==="expense"?-1:1)));
if(expected!==undefined){assert.ok(Number.isFinite(Number(expected)),"La suma esperada debe ser un número.");assert.ok(Math.abs(available-Number(expected))<0.005,"La suma de REAL no coincide con la esperada.");}
assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"),hash,"El archivo original cambió durante la comprobación.");
console.log(JSON.stringify({hoja:"BASE",registros:summary.total,movimientosBanco:bank.length,sumaREAL:available,advertencias:summary.warning,archivoSinCambios:true},null,2));
