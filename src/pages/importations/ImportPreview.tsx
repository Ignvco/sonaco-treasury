import { useState } from "react";
import { Check, Download } from "lucide-react";
import { DataTable } from "@/components/treasury/DataTable";
import { SectionCard } from "@/components/treasury/SectionCard";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import type { ImportOverrides, ImportPreview as Preview, ProcessedRecord, ImportComparisonRow } from "@/import-engine/types";
import { downloadFile, toCSV } from "@/lib/export";
const labels={new:"Nuevas",modified:"Modificadas",unchanged:"Sin cambios",conflict:"Coincidencia ambigua",invalid:"Con errores"};
const fields:Record<string,string>={amount:"Importe",dueDate:"Vencimiento",reportDate:"Fecha prevista",adjustedDate:"Fecha ajustada",date:"Fecha",issueDate:"Emisión",endDate:"Rescate",startDate:"Inicio",currency:"Moneda",bank:"Banco",settlementBank:"Banco de cobro",description:"Descripción",category:"Categoría",status:"Estado",rate:"Tasa",interest:"Interés",ledgerCode:"Cuenta contable",type:"Ingreso/egreso"};
const diffs=(c:ImportComparisonRow)=>Object.entries(fields).filter(([key])=>JSON.stringify(c.before?.[key]??null)!==JSON.stringify(c.after[key]??null)).map(([key,label])=>label+": "+String(c.before?.[key]??"—")+" → "+String(c.after[key]??"—"));
export function ImportPreview({preview,busy,onConfirm,onDiscard}:{
 preview:Preview;applied:ImportOverrides;busy:boolean;onAnalyze:(o:ImportOverrides)=>void;onConfirm:(rows:number[])=>void;onDiscard:()=>void;
}) {
 const comparison=preview.comparison?.rows??[];
 const [selected,setSelected]=useState<number[]>(comparison.filter(r=>r.change==="modified").map(r=>r.row));
 const [filter,setFilter]=useState(""),[reviewed,setReviewed]=useState(false);
 const byRow=new Map(comparison.map(r=>[r.row,r]));
 const data=preview.records.filter(r=>!filter||byRow.get(r.row)?.change===filter);
 const newCount=comparison.filter(r=>r.change==="new").length;
 const accepted=newCount+selected.length;
 const exportReview=()=>downloadFile(toCSV(comparison.map(c=>({Fila:c.row,Estado:labels[c.change],Cambios:diffs(c).join(" · "),Detalle:c.reason??""}))),"revision-cambios-base.csv","text/csv;charset=utf-8");
 return <section aria-label="Vista previa de importación"><SectionCard title="Compara tu Excel antes de actualizar" subtitle={preview.fileName}>
  <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">{Object.entries(labels).map(([key,label])=><button key={key} className={`rounded-xl border p-4 text-left ${filter===key?"border-brand bg-brand-soft":"bg-slate-50"}`} onClick={()=>setFilter(filter===key?"":key)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{comparison.filter(c=>c.change===key).length}</p></button>)}</div>
  <p className="mb-4 rounded-xl bg-brand-soft p-4 text-sm">Solo se lee BASE. Los registros nuevos se añaden; las modificaciones seleccionadas actualizan el mismo registro y conservan su historial. Las filas ambiguas y los errores se mantienen pendientes.</p>
  <div className="mb-4 flex flex-wrap gap-3"><button className="t-button-secondary" onClick={()=>setFilter("")}>Mostrar todas</button><button className="t-button-secondary" onClick={exportReview}><Download size={15}/> Descargar comparación</button></div>
  <DataTable<ProcessedRecord> data={data} rowKey={r=>String(r.row)} pageSize={8} search searchText={r=>r.row+" "+r.normalized.description+" "+r.normalized.customer+" "+r.normalized.document} columns={[
   {key:"row",header:"Fila BASE",render:r=>r.row,sortValue:r=>r.row},
   {key:"kind",header:"Origen",render:r=>String(r.normalized.sourceOrigin??r.entityType)},
   {key:"detail",header:"Descripción / cliente",className:"!whitespace-normal min-w-[180px] max-w-[280px]",render:r=>String(r.normalized.customer||r.normalized.description||"—")},
   {key:"amount",header:"Importe",align:"right",render:r=>baseNumber(Number(r.normalized.amount??0))+" "+r.normalized.currency},
   {key:"change",header:"Resultado",render:r=>labels[byRow.get(r.row)?.change??"invalid"]},
   {key:"diff",header:"Cambios y observaciones",className:"!whitespace-normal min-w-[260px] max-w-[400px]",render:r=>{const c=byRow.get(r.row);return <div className="space-y-1 text-xs">{c?.change==="modified"&&diffs(c).map(d=><p key={d}>{d}</p>)}<p className="text-muted-foreground">{c?.reason||r.warnings||"Validación correcta"}</p></div>;}},
   {key:"apply",header:"Aplicar",render:r=>byRow.get(r.row)?.change==="modified"?<input type="checkbox" aria-label={"Aplicar cambio fila "+r.row} checked={selected.includes(r.row)} disabled={busy} onChange={e=>{setSelected(s=>e.target.checked?[...s,r.row]:s.filter(n=>n!==r.row));setReviewed(false);}}/>:byRow.get(r.row)?.change==="new"?"Se añadirá":"—"},
  ]}/>
  <label className="my-5 flex items-start gap-3 rounded-xl border p-4 text-sm"><input className="mt-1" type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>Revisé la comparación y sus advertencias. Se añadirán {newCount} filas y se actualizarán {selected.length}. Los registros sin cambios se conservarán.</span></label>
  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground">Si alguien modifica los datos antes de guardar, deberás volver a analizar el archivo.</p><div className="flex gap-2"><button disabled={busy} className="t-button-secondary" onClick={onDiscard}>Descartar</button><button disabled={busy||!reviewed||!preview.comparison||!preview.total||preview.valid+preview.warning===0} className="t-button-primary" onClick={()=>onConfirm(selected)}><Check size={15}/>{accepted?"Aplicar "+accepted+" cambios":"Confirmar revisión sin cambios"}</button></div></div>
 </SectionCard></section>;
}
