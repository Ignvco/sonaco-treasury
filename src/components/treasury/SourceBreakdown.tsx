import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataTable } from "./DataTable";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { total, type TreasuryRow, type ForecastEvent } from "@/financial-engine/base-treasury";
export const baseNumber=(n:number)=>new Intl.NumberFormat("es-CL",{maximumFractionDigits:2}).format(n);
export function SourceBreakdown({title,rows,onClose}:{title:string;rows:(TreasuryRow|ForecastEvent)[];onClose:()=>void}) {
 const request=useRef(0);
 const [detail,setDetail]=useState<{title:string;raw:Record<string,unknown>}|null>(null);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const amount=(r:TreasuryRow|ForecastEvent)=>"signed" in r?r.signed:r.type==="expense"?-r.amount:r.amount;
 const open=async(row:TreasuryRow)=>{
   const revision=++request.current;
   setDetail(null);setError("");setBusy(false);if(!row.recordId){setDetail({title:"Ingreso en plataforma",raw:{Descripción:row.description,Fecha:row.date,Monto:row.amount,Moneda:row.currency}});return;}
   setBusy(true);try{const d=await baseTreasuryService.trace(row.recordId);if(revision===request.current)setDetail({title:row.fileName+" · "+d.source_sheet+" · fila "+d.source_row,raw:d.raw_json});}
   catch(e){if(revision===request.current)setError(e instanceof Error?e.message:"No se pudo cargar el origen.");}finally{if(revision===request.current)setBusy(false);}
 };
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
  <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Selecciona una fila para consultar sus valores originales de BASE.</DialogDescription></DialogHeader>
  <DataTable data={rows} rowKey={r=>r.kind+":"+r.id} pageSize={8} search searchText={r=>r.description+" "+r.document+" "+r.bank+" "+r.row} onRowClick={r=>void open(r)} columns={[
   {key:"date",header:"Fecha",render:r=>"effectiveDate" in r?r.effectiveDate:r.date,sortValue:r=>r.date},
   {key:"source",header:"Origen",render:r=>r.origin},
   {key:"detail",header:"Detalle",className:"!whitespace-normal min-w-[180px]",render:r=>r.description||r.customer||r.document},
   {key:"bank",header:"Banco",render:r=>r.bank},
   {key:"row",header:"Fila BASE",render:r=>r.row??"Manual"},
   {key:"amount",header:"Aporte al cálculo",align:"right",render:r=>baseNumber(amount(r)),sortValue:amount},
   {key:"currency",header:"Moneda",render:r=>r.currency}
  ]}/>
  <p className="text-right text-sm font-semibold tabular-nums">Total del desglose (todas las filas): {baseNumber(total(rows.map(amount)))}</p>
  {busy&&<p role="status">Cargando fila original…</p>}{error&&<p role="alert" className="text-danger">{error}</p>}
  {detail&&<section className="rounded-xl border p-4"><h3 className="mb-3 text-sm font-semibold">{detail.title}</h3><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(detail.raw).map(([key,cell])=>{
   const c=cell&&typeof cell==="object"?cell as {value?:unknown;formula?:string}:null;
   return <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-words text-sm">{String(c?c.value??"—":cell??"—")}</dd>{c?.formula&&<dd className="mt-1 break-all text-xs text-muted-foreground">Fórmula guardada: {c.formula}</dd>}</div>;
  })}</dl></section>}
 </DialogContent></Dialog>;
}
