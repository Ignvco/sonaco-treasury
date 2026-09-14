import * as XLSX from "xlsx";
import { cellText, cellToDate, cellToNumber, isErrorCell } from "./detect";
import { classifyCategory, normalizeBankName, normalizeCurrency, normalizeStatus } from "./normalize";
import { validateRecord } from "./validate";
import type { ImportEntityType } from "@/financial-engine/types";
import { MAX_IMPORT_ROWS, type ProcessedRecord } from "./types";
import type { WorkSheetData } from "./pipeline";

export const BASE_READER_VERSION = "BASE-ONLY-20260914-v1";
const text = (v: unknown) => cellText(v).trim();
const key = (v: unknown) => text(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const number = (v: unknown) => cellToNumber(v);
const date = (v: unknown) => cellToDate(v).iso;
const usefulText = (v: unknown) => text(v) && text(v) !== "0" ? text(v) : null;

export function findBaseSheet(names: string[]): string {
  const matches=names.filter((name)=>name.trim().toUpperCase()==="BASE");
  if(matches.length!==1) throw new Error(matches.length ? "Hay más de una hoja llamada BASE. No se pudo identificar una única fuente." : "No se encontró la hoja BASE. Selecciona el libro que contiene esa hoja.");
  return matches[0];
}

/** Consume cached values from BASE only. Formula references are audit metadata;
 * they are never followed or evaluated and no other worksheet is accessed. */
export function readSonacol(wb: XLSX.WorkBook, name=findBaseSheet(wb.SheetNames)): WorkSheetData[] {
  const ws=wb.Sheets[name];
  if(!ws) throw new Error("No se pudo leer la hoja BASE.");
  const byRow=new Map<number,Record<string,XLSX.CellObject>>();
  for(const [address,cell] of Object.entries(ws)) {
    if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address)) continue;
    const {r,c}=XLSX.utils.decode_cell(address);
    if(r>=1048576||c>=16384) throw new Error("BASE contiene una dirección de celda inválida.");
    const row=byRow.get(r+1)??{};
    row[XLSX.utils.encode_col(c)]={...cell,date1904:!!wb.Workbook?.WBProps?.date1904} as XLSX.CellObject;
    byRow.set(r+1,row);
  }
  const positions=[...byRow.keys()].sort((a,b)=>a-b);
  const required:Record<string,string>={A:"TABLA ORIGEN",D:"FECHA",E:"CODIGO CTA",P:"DEBE",Q:"HABER",R:"REAL"};
  const header=positions.find((r)=>Object.entries(required).every(([c,label])=>key(byRow.get(r)?.[c])===key(label)));
  if(!header) throw new Error("BASE no tiene los encabezados esperados: TABLA ORIGEN, FECHA, CODIGO CTA, DEBE, HABER y REAL. No se leyeron otras hojas.");
  const records:ProcessedRecord[]=[];
  const occurrences=new Map<string,number>();
  let skipped=0;
  for(const rowNumber of positions.filter((r)=>r>header)) {
    const row=byRow.get(rowNumber)!;
    const monetary=["P","Q","R"].map((c)=>row[c]);
    // An error or uncached formula in a financial cell must remain reviewable.
    const hasFinancialValue=monetary.some((c)=>isErrorCell(c)||(!!c?.f&&c.v==null)||(number(c)??0)!==0||(!!text(c)&&number(c)===null));
    const hasDatedDocument=!!date(row.D)&&!!usefulText(row.K);
    if(!hasFinancialValue&&!hasDatedDocument) {skipped++;continue;}
    if(records.length>=MAX_IMPORT_ROWS) throw new Error("BASE supera 20.000 registros financieros. Las filas de plantilla no cuentan para este límite.");
    const origin=key(row.A);
    const entityType:ImportEntityType=origin==="BANCO"?"cash_flow":origin==="CLIENTES"?"invoice":origin==="COLOCACIONES"?"investment":origin==="MANUAL"||origin==="PROYEC"?"projection":"unknown";
    const d=number(row.P),h=number(row.Q),cachedNet=number(row.R);
    const net=cachedNet??((d??0)-(h??0));
    const type=net<0?"expense":"income";
    const operation=usefulText(row.U);
    const description=usefulText(row.L)??(entityType==="projection"?usefulText(row.I):null)??operation??usefulText(row.F)??"";
    const currencyLabel=text(row.F)+" "+text(row.T);
    const currencyColumn=Object.entries(byRow.get(header)!).find(([,c])=>key(c)==="MONEDA")?.[0];
    const currency=currencyColumn ? normalizeCurrency(text(row[currencyColumn])) : {currency:/US\$|\bUSD\b|D[OÓ]LAR/i.test(currencyLabel)?"USD":"CLP",known:true};
    const accountCode=usefulText(row.E);
    const settlementBank=normalizeBankName(usefulText(row.T));
    // In BASE, CTA CTE (AE) is a voucher line, not a bank account number.
    const bank=entityType==="cash_flow"?normalizeBankName(usefulText(row.F)):entityType==="investment"?normalizeBankName(usefulText(row.I)):settlementBank;
    const n:Record<string,unknown>={entityType,sourceProfile:BASE_READER_VERSION,sourceOrigin:origin,company:usefulText(row.B),ledgerCode:accountCode,
      bank,settlementBank,account:null,description,category:classifyCategory(type,(operation??description).normalize("NFD").replace(/[\u0300-\u036f]/g,"")),
      currency:currency.currency,currencyKnown:currency.known,type,amount:entityType==="invoice"||entityType==="investment"?net:Math.abs(net),debe:d,haber:h,
      voucher:usefulText(row.G),document:usefulText(row.K),reportDate:date(row.N),adjustedDate:date(row.O),originalDueDate:date(row.M)};
    const used=["A","B","P","Q","R"];
    const warnings:string[]=[];
    if(entityType==="cash_flow") {
      const state=normalizeStatus(usefulText(row.S));
      const allowed=["conciliado","confirmado","programado","pendiente","proyectado","borrador","pagado","cancelado","vencido"];
      Object.assign(n,{date:date(row.D),status:state??"confirmado"});
      if(state&&!allowed.includes(state)) warnings.push("Estado de movimiento no reconocido en BASE.");
      used.push("D","E","F","L","S");
    } else if(entityType==="invoice") {
      Object.assign(n,{customer:usefulText(row.I),rut:usefulText(row.H),issueDate:date(row.D),dueDate:date(row.M)??date(row.N)});
      used.push("D","H","I","K",row.M&&number(row.M)!==0?"M":"N");
    } else if(entityType==="investment") {
      Object.assign(n,{startDate:date(row.D),endDate:date(row.M)??date(row.N),investmentType:/FONDO|FFMM/.test(key(row.F)+key(row.J))?"fondo_mutuo":"colocacion",rate:null,interest:null,rateKnown:false});
      used.push("D","I",row.M&&number(row.M)!==0?"M":"N");
      warnings.push("BASE no informa tasa ni interés de la inversión.");
    } else if(entityType==="projection") {
      // BASE's adjusted/due date takes precedence over the entry date.
      const dateColumn=usefulText(row.O)?"O":usefulText(row.N)?"N":"D";
      Object.assign(n,{date:date(row[dateColumn]),status:"proyectado"});
      used.push(dateColumn,"T","U");
    }
    if(currencyColumn) used.push(currencyColumn);
    if(currency.currency==="USD") warnings.push("Moneda USD identificada en la descripción de cuenta de BASE; se conserva el monto original.");
    const issues=validateRecord({...n,entityType,currencyKnown:n.currencyKnown===true});
    if(entityType==="cash_flow"&&!['conciliado','confirmado','programado','pendiente','proyectado','borrador','pagado','cancelado','vencido'].includes(String(n.status))) issues.push({kind:"error",message:"Estado de movimiento inválido en BASE."});
    if((entityType==="cash_flow"||entityType==="projection")&&((d??0)<0||(h??0)<0||((d??0)>0&&(h??0)>0))) issues.push({kind:"error",message:"Debe/Haber contiene valores negativos o montos en ambos lados; revisa esta fila de BASE."});
    if(cachedNet!==null&&d!==null&&h!==null&&Math.abs(cachedNet-(d-h))>0.005) issues.push({kind:"error",message:"REAL no coincide con DEBE menos HABER en BASE."});
    for(const c of new Set(used)) {
      const cell=row[c];
      if(isErrorCell(cell)) issues.push({kind:"error",message:`BASE!${c}${rowNumber} contiene un error de Excel.`});
      else if(cell?.f&&cell.v==null) issues.push({kind:"error",message:`BASE!${c}${rowNumber} no tiene resultado guardado. No se intentó consultar otra hoja.`});
    }
    // Only records from the preceding multi-sheet importer use this reference.
    // Its content is already present in BASE's formula text; no linked cell is read.
    const legacy=row.D?.f?.match(/^\+?(?:'([^']+)'|([A-Za-z ]+))!\$?[A-Z]+\$?(\d+)$/);
    if(legacy) {n.legacySheet=(legacy[1]??legacy[2]).trim();n.legacyRow=Number(legacy[3]);}
    const identity=JSON.stringify([entityType,n.company,accountCode,n.voucher,n.document,n.rut,n.customer,bank,n.currency,n.type,n.amount,n.date,n.issueDate,n.dueDate,n.startDate,n.endDate,description]);
    const occurrence=(occurrences.get(identity)??0)+1;occurrences.set(identity,occurrence);
    n.sourceId=`BASE:${identity}:${occurrence}`;
    const raw=Object.fromEntries(Object.entries(row).map(([c,v])=>[`${c}${rowNumber} · ${text(byRow.get(header)![c])}`,{value:v.v??null,type:v.t,formula:v.f??null}]));
    const status=issues.some((i)=>i.kind==="error")?"ERROR":warnings.length?"WARNING":"VALID";
    records.push({sheet:name,row:rowNumber,entityType,normalized:n,raw,status,warnings:[...issues.map((i)=>i.message),...warnings].join(" · "),dedupeKey:n.sourceId as string});
  }
  return [{name,rows:[],prepared:records,profile:BASE_READER_VERSION,headerIndex:header,
    note:`Lectura exclusiva de BASE. Se clasifican las filas por TABLA ORIGEN usando sus valores guardados. ${skipped.toLocaleString("es-CL")} filas sin operación financiera se omiten. Los códigos contables y las fechas se conservan en el detalle.`}];
}
