/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { ForecastLink, TreasuryRow } from "@/financial-engine/base-treasury";
const db = supabase as any;
export const baseTreasuryService = {
  async load(): Promise<{rows:TreasuryRow[];links:ForecastLink[];cutoff:string;warning:string}> {
    const {data,error}=await db.rpc("get_base_treasury_snapshot");
    if(error) throw new Error(["42P01","42883","PGRST202"].includes(error.code) ? "Aplica la actualización SQL de las cinco mejoras para habilitar este panel." : error.message);
    if(!data||!Array.isArray(data.traces)) throw new Error("No se recibió la información de BASE.");
    const {traces,projections,links,banks,manual_cash_flow=[]}=data;
    const rows:TreasuryRow[]=traces.map(r=>{
      const n=r.current_normalized, e=r.entity;
      const date=e.date??e.issue_date??e.start_date??"";
      return {id:r.entity_id,kind:r.entity_type,inLatest:r.in_latest!==false,origin:n.sourceOrigin??"",amount:Number(e.amount),currency:e.currency,type:e.type??"income",status:e.status,
        date,plannedDate:n.adjustedDate??n.reportDate??e.due_date??e.end_date??date,
        bank:n.settlementBank??n.bank??"Sin banco",ledger:n.ledgerCode??"",description:n.description??"",document:n.document??"",customer:n.customer??"",
        interest:r.entity_type==="investment"&&e.rate_known?Number(e.estimated_interest??0):0,
        cutoff:n.cutoffDate??"",fileName:r.file_name,row:r.source_row,recordId:r.id};
    });
    for(const p of projections.filter(p=>!rows.some(r=>r.kind==="projection"&&r.id===p.id))) rows.push({
      id:p.id,kind:"projection",origin:"PLATAFORMA",amount:Number(p.amount),currency:p.currency,type:p.type,status:p.status,date:p.date,plannedDate:p.date,
      bank:banks.find(b=>b.id===p.bank_id)?.name??"Sin banco",ledger:"",description:p.description,document:"",customer:"",interest:0,cutoff:"",fileName:"Ingreso en plataforma",row:null,recordId:null,
    });
    for(const p of manual_cash_flow) rows.push({
      id:p.id,kind:"cash_flow",origin:"PLATAFORMA",amount:Number(p.amount),currency:p.currency,type:p.type,status:p.status,date:p.date,plannedDate:p.date,
      bank:banks.find(b=>b.id===p.bank_id)?.name??"Sin banco",ledger:"",description:p.description,document:"",customer:"",interest:0,cutoff:"",fileName:"Ingreso en plataforma",row:null,recordId:null,
    });
    // BANCO balances belong to the account in F, not the settlement destination in T.
    for(const row of rows.filter(r=>r.kind==="cash_flow"&&r.origin==="BANCO")) {
      const trace=traces.find(t=>t.entity_id===row.id); row.bank=trace?.current_normalized.bank??"Sin banco";
    }
    const cutoffs=rows.filter(r=>r.inLatest!==false).map(r=>r.cutoff).filter(Boolean).sort();
    const bankDates=rows.filter(r=>r.inLatest!==false&&r.origin==="BANCO").map(r=>r.date).filter(Boolean).sort();
    return {rows,links,warning:data.latest_batch?.status==="partial"||data.latest_batch?.status==="failed"?"La última carga contiene errores. Estos saldos incluyen los registros guardados; revisa la importación antes de utilizarlos como cierre.":"",cutoff:cutoffs[cutoffs.length-1]??bankDates[bankDates.length-1]??new Date().toISOString().slice(0,10)};
  },
  async trace(id:string) {
    const {data,error}=await db.from("import_records").select("raw_json,normalized_json,source_row,source_sheet").eq("id",id).single();
    if(error) throw new Error(error.message);
    return data as {raw_json:Record<string,unknown>;normalized_json:Record<string,unknown>;source_row:number;source_sheet:string};
  },
  async link(projectionId:string,targetKind:string,targetId:string) {
    const {error}=await db.from("forecast_links").insert({projection_id:projectionId,target_kind:targetKind,target_id:targetId});
    if(error) throw new Error(error.message);
  },
  async unlink(id:string) {const {error}=await db.from("forecast_links").delete().eq("id",id).select("id").single(); if(error) throw new Error(error.message);}
};
