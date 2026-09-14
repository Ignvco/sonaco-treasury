import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCanWrite } from "@/contexts/auth-context";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import type { ForecastLink, TreasuryRow } from "@/financial-engine/base-treasury";
export function ForecastLinks({rows,links,onClose,onRefresh}:{rows:TreasuryRow[];links:ForecastLink[];onClose:()=>void;onRefresh:()=>void}) {
 const canWrite=useCanWrite(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [projection,setProjection]=useState(""),[target,setTarget]=useState("");
 const p=rows.find(r=>r.kind==="projection"&&r.id===projection);
 const targets=rows.filter(r=>r.inLatest!==false&&["invoice","investment"].includes(r.kind)&&!["pagado","rescatada"].includes(r.status)&&r.currency===p?.currency&&Math.abs(r.amount+r.interest-(p?.amount??0))<0.005&&!links.some(l=>l.target_id===r.id));
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();onRefresh();setProjection("");setTarget("");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}finally{setBusy(false);}};
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
  <DialogHeader><DialogTitle>Evitar cobros duplicados</DialogTitle><DialogDescription>Si una proyección manual representa el mismo cobro o rescate del ERP, vincúlalos. Se usará una sola vez, con la fecha y banco de la proyección manual.</DialogDescription></DialogHeader>
  <p className="text-xs text-muted-foreground">Solo se vinculan importes y monedas iguales. Las partidas distintas del mismo importe se conservan separadas hasta que confirmes el vínculo.</p>
  {links.map(l=><div key={l.id} className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm"><p>{rows.find(r=>r.kind==="projection"&&r.id===l.projection_id)?.description??"Proyección"} → {rows.find(r=>r.kind===l.target_kind&&r.id===l.target_id)?.document||l.target_kind}</p>{canWrite&&<button disabled={busy} className="t-button-secondary" onClick={()=>void act(()=>baseTreasuryService.unlink(l.id))}>Desvincular</button>}</div>)}
  {!links.length&&<p className="text-sm text-muted-foreground">No hay vínculos registrados.</p>}
  {canWrite&&<div className="grid gap-4 rounded-xl bg-slate-50 p-4">
   <label className="grid gap-2 text-sm">Proyección manual<select className="t-input w-full" value={projection} onChange={e=>{setProjection(e.target.value);setTarget("");}}><option value="">Seleccionar</option>{rows.filter(r=>r.inLatest!==false&&r.kind==="projection"&&r.type==="income"&&!["cancelado","borrador"].includes(r.status)&&!links.some(l=>l.projection_id===r.id)).map(r=><option key={r.id} value={r.id}>{r.description} · {baseNumber(r.amount)} {r.currency}</option>)}</select></label>
   <label className="grid gap-2 text-sm">Cobro o rescate que representa<select className="t-input w-full" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Seleccionar coincidencia</option>{targets.map(r=><option key={r.id} value={r.kind+":"+r.id}>{r.customer||r.description} · {r.document} · {r.plannedDate}</option>)}</select></label>
   {p&&!targets.length&&<p className="text-sm">No hay cobros o rescates disponibles del mismo importe y moneda.</p>}
   <button disabled={busy||!projection||!target} className="t-button-primary justify-center" onClick={()=>void act(()=>{const [kind,id]=target.split(":");return baseTreasuryService.link(projection,kind,id);})}>Vincular y contar una sola vez</button>
  </div>}
  {error&&<p role="alert" className="text-danger">{error}</p>}
 </DialogContent></Dialog>;
}
