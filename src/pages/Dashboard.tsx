import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, RefreshCw, Wallet, CalendarDays, PiggyBank, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { useAsyncData } from "@/hooks/use-async";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { baseTreasury, type TreasuryRow, type ForecastEvent } from "@/financial-engine/base-treasury";
import { SourceBreakdown, baseNumber } from "@/components/treasury/SourceBreakdown";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState, EmptyState } from "@/components/treasury/feedback";
import { ForecastLinks } from "./dashboard/ForecastLinks";
export default function Dashboard() {
 const [refresh,setRefresh]=useState(0),[linking,setLinking]=useState(false);
 const [detail,setDetail]=useState<{title:string;rows:(TreasuryRow|ForecastEvent)[]}|null>(null);
 const [filters,setFilters,reset]=useSavedFilters("dashboard-v6",{horizon:30,currency:"BASE",bank:"",cutoff:""});
 const {data,loading,error}=useAsyncData(()=>baseTreasuryService.load(),[refresh]);
 const cutoff=filters.cutoff||data?.cutoff||"2026-01-01";
 const model=useMemo(()=>data?baseTreasury(data.rows,data.links,cutoff,[7,15,30].includes(filters.horizon)?filters.horizon:30,filters.currency,filters.bank):null,[data,cutoff,filters.horizon,filters.currency,filters.bank]);
 const open=(title:string,rows:(TreasuryRow|ForecastEvent)[])=>setDetail({title,rows});
 if(loading)return <LoadingState label="Calculando caja y proyecciones desde BASE…"/>;
 if(error)return <ErrorState message={error} onRetry={()=>setRefresh(x=>x+1)}/>;
 if(!data||!model)return <EmptyState/>;
 const kpis=[
  {label:"Caja disponible",value:model.available,icon:Wallet,subtitle:"BANCO · suma de REAL al corte",rows:model.cashRows,primary:true},
  {label:"Caja proyectada",value:model.projected,icon:TrendingUp,subtitle:"Saldo al final del horizonte",rows:[...model.cashRows,...model.events]},
  {label:"Ingresos esperados",value:model.collections,icon:ArrowDownLeft,subtitle:"Clientes, rescates y manuales",rows:model.collectionRows},
  {label:"Egresos previstos",value:model.payments,icon:ArrowUpRight,subtitle:"Pagos incluidos en el horizonte",rows:model.paymentRows},
  {label:"En inversiones",value:model.invested,icon:PiggyBank,subtitle:"Capital aún no rescatado",rows:model.investedRows},
 ];
 return <div className="t-fade-in min-w-0 space-y-6">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">SONACOL · Tesorería</p><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Tu caja, con cada dato a la vista</h1><p className="mt-2 text-sm text-muted-foreground">Corte de BASE: {data.cutoff} · Selecciona cualquier cifra para revisar su origen.</p></div><button aria-label="Actualizar dashboard" className="t-button-secondary" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={15}/> Actualizar</button></header>
  <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4" aria-label="Filtros del dashboard">
   <label className="grid gap-1 text-xs font-medium">Horizonte<select className="t-input" value={filters.horizon} onChange={e=>setFilters(f=>({...f,horizon:Number(e.target.value)}))}>{[7,15,30].map(n=><option key={n} value={n}>{n} días</option>)}</select></label>
   <label className="grid gap-1 text-xs font-medium">Valores<select className="t-input" value={filters.currency} onChange={e=>setFilters(f=>({...f,currency:e.target.value}))}><option value="BASE">Como en BASE · sin conversión</option>{[...new Set(data.rows.map(r=>r.currency))].sort().map(c=><option key={c} value={c}>Solo {c}</option>)}</select></label>
   <label className="grid gap-1 text-xs font-medium">Banco<select className="t-input" value={filters.bank} onChange={e=>setFilters(f=>({...f,bank:e.target.value}))}><option value="">Todos los bancos</option>{[...new Set(data.rows.map(r=>r.bank))].sort().map(b=><option key={b} value={b}>{b}</option>)}</select></label>
   <label className="grid gap-1 text-xs font-medium">Corte de movimientos BANCO<input type="date" className="t-input" value={cutoff} onChange={e=>setFilters(f=>({...f,cutoff:e.target.value}))}/></label>
   <button className="t-button-secondary" onClick={reset}>Restablecer</button><p className="ml-auto text-xs text-muted-foreground">Filtros guardados en este navegador para tu usuario.</p>
  </section>
  {!data.rows.length&&<div className="rounded-xl border bg-white p-5 text-sm">Todavía no hay filas BASE guardadas. <Link className="text-brand underline" to="/importations">Importa el libro Excel</Link>.</div>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map(k=><button key={k.label} onClick={()=>open(k.label,k.rows)} className={`group min-w-0 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${k.primary?"border-brand bg-brand text-white":"bg-white"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{k.label}</span><k.icon size={17} className="opacity-70"/></div><p className="mt-4 break-words text-[clamp(1.2rem,1.9vw,1.8rem)] font-semibold tracking-tight tabular-nums">{new Intl.NumberFormat("es-CL",{maximumFractionDigits:filters.currency==="USD"?2:0}).format(k.value)}</p><p className={`mt-2 text-[11px] ${k.primary?"text-white/75":"text-muted-foreground"}`}>{k.subtitle}</p><p className="mt-4 flex items-center gap-1 text-[11px] opacity-70">Ver desglose <ChevronRight size={12}/></p></button>)}</div>
  <p className="text-xs text-muted-foreground">{filters.currency==="BASE"?"Se suman literalmente los valores de REAL, como en el libro. Este total no convierte monedas; el desglose conserva la moneda de cada fila.":"Todos los importes de esta vista están expresados en "+filters.currency+"; las demás monedas quedan fuera del filtro."} La apertura ya está incluida en los movimientos BANCO.</p>
  <div className="grid gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
   <section className="min-w-0 rounded-2xl border bg-white p-5 md:p-6"><div className="mb-6 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Evolución de caja</h2><p className="mt-1 text-xs text-muted-foreground">Caja disponible + ingresos − egresos · próximos {filters.horizon} días</p></div><CalendarDays size={20} className="text-brand"/></div>
    <div className="h-[310px] w-full" aria-label="Gráfico de saldo proyectado"><ResponsiveContainer width="100%" height="100%"><AreaChart data={model.days} margin={{left:5,right:12,top:12,bottom:5}}><defs><linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4263eb" stopOpacity={0.24}/><stop offset="100%" stopColor="#4263eb" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e9edf3"/><XAxis dataKey="date" tickFormatter={d=>String(d).slice(5)} tick={{fontSize:11}} axisLine={false} tickLine={false} minTickGap={30}/><YAxis width={75} tickFormatter={v=>new Intl.NumberFormat("es-CL",{notation:"compact",maximumFractionDigits:1}).format(Number(v))} tick={{fontSize:11}} axisLine={false} tickLine={false}/><Tooltip formatter={v=>[baseNumber(Number(v)),"Saldo"]} labelFormatter={v=>String(v)}/><ReferenceLine y={0} stroke="#dc5965" strokeDasharray="4 4"/><Area type="stepAfter" dataKey="balance" stroke="#4263eb" strokeWidth={2.5} fill="url(#cashFill)" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
    <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>La tabla inferior permite revisar cada día y su cálculo.</span><button className="font-medium text-brand underline" onClick={()=>open("Saldo mínimo del horizonte",[...model.cashRows,...model.events.filter(r=>r.effectiveDate<=(model.days.find(d=>d.balance===model.minimum)?.date??cutoff))])}>Mínimo: {baseNumber(model.minimum)}</button></div>
   </section>
   <aside className="space-y-4 rounded-2xl border bg-[#f5f7fc] p-5"><h2 className="font-semibold">Por revisar</h2>
    <button className="w-full rounded-xl border bg-white p-4 text-left" onClick={()=>open("Pendientes anteriores al corte",model.overdue)}><p className="text-sm font-semibold">{model.overdue.length} pendientes anteriores al corte</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Se muestran en el primer día proyectado. Su cobro o rescate todavía requiere confirmar la fecha.</p></button>
    {model.minimum<0&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">La proyección presenta un déficit dentro del período seleccionado.</div>}
    {model.issues.map(issue=><p key={issue} role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{issue}</p>)}
    <button className="t-button-secondary w-full justify-center" onClick={()=>setLinking(true)}>Revisar vínculos de cobros</button>
    <Link to="/importations" className="flex items-center justify-between rounded-xl bg-brand p-4 text-sm font-medium text-white">Actualizar desde Excel <ChevronRight size={17}/></Link>
    <p className="text-xs leading-relaxed text-muted-foreground">PROYECTADO se incorpora mediante sus filas en BASE. La plataforma sigue importando únicamente BASE.</p>
   </aside>
  </div>
  <section className="rounded-2xl border bg-white p-5"><h2 className="mb-4 font-semibold">Saldo contable por banco</h2><DataTable data={model.positions} rowKey={r=>r.key} pageSize={9} storageKey="dashboard-banks" onRowClick={r=>open(r.bank+" · "+r.ledger,r.rows)} columns={[
   {key:"bank",header:"Banco",sortValue:r=>r.bank},{key:"ledger",header:"Código contable"},{key:"currency",header:"Moneda"},{key:"amount",header:"Saldo REAL",align:"right",render:r=>baseNumber(r.amount),sortValue:r=>r.amount}
  ]}/><p className="mt-3 text-xs text-muted-foreground">Saldos calculados desde las partidas BANCO de BASE. La conciliación con cartola se consulta por separado.</p></section>
  <section className="rounded-2xl border bg-white p-5"><h2 className="mb-4 font-semibold">Detalle diario de la proyección</h2><DataTable data={model.days} rowKey={r=>r.date} storageKey="dashboard-days" pageSize={7} columns={[
   {key:"date",header:"Día",sortValue:r=>r.date},
   {key:"income",header:"Ingresos",align:"right",render:r=><button className="text-emerald-700 underline decoration-dotted underline-offset-4" onClick={()=>open("Ingresos · "+r.date,model.collectionRows.filter(e=>e.effectiveDate===r.date))}>{baseNumber(r.income)}</button>},
   {key:"expense",header:"Egresos",align:"right",render:r=><button className="text-red-700 underline decoration-dotted underline-offset-4" onClick={()=>open("Egresos · "+r.date,model.paymentRows.filter(e=>e.effectiveDate===r.date))}>{baseNumber(r.expense)}</button>},
   {key:"balance",header:"Caja al cierre",align:"right",render:r=><button className="font-semibold underline decoration-dotted underline-offset-4" onClick={()=>open("Caja al cierre · "+r.date,[...model.cashRows,...model.events.filter(e=>e.effectiveDate<=r.date)])}>{baseNumber(r.balance)}</button>}
  ]}/></section>
  {detail&&<SourceBreakdown key={detail.title} {...detail} onClose={()=>setDetail(null)}/>}
  {linking&&<ForecastLinks rows={data.rows} links={data.links} onClose={()=>setLinking(false)} onRefresh={()=>setRefresh(x=>x+1)}/>}
 </div>;
}
