import { Link } from "react-router-dom";
import { FileSpreadsheet, Landmark, ServerCog } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { importService } from "@/services/importService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge, type StatusTone } from "@/components/treasury/StatusBadge";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import { formatDateMedium } from "@/financial-engine/format";

const LABEL:Record<string,string>={Success:"Guardado",Warning:"Revisar",Error:"No guardado",Unverified:"Sin verificar",NoChanges:"Sin cambios"};
const TONE:Record<string,StatusTone>={Success:"success",Warning:"warning",Error:"danger",Unverified:"muted",NoChanges:"info"};
export default function Integrations() {
  const {data,loading,error}=useAsyncData(()=>importService.getIntegrationStatus(),[]);
  if(loading) return <LoadingState />;
  if(error) return <ErrorState message={error} />;
  if(!data) return null;
  return <div className="t-fade-in flex flex-col gap-5">
    <PageHeader title="Centro de Integraciones" subtitle="Comprueba el origen y los datos guardados en tu plataforma" actions={<Link className="t-button-primary" to="/importations"><FileSpreadsheet size={16}/> Nueva importación</Link>}/>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="t-card space-y-4 border-brand/30 p-5">
        <div className="flex items-center justify-between gap-3"><FileSpreadsheet className="text-brand"/><StatusBadge label={data.records?"Datos disponibles":"Listo para importar"} tone={data.records?"success":"info"}/></div>
        <div><h2 className="font-semibold">Excel histórico</h2><p className="mt-1 text-xs text-muted-foreground">Archivos .xlsx, .xlsm y .xls · Solo hoja BASE</p></div>
        <div className="rounded-xl bg-brand-soft p-4"><p className="text-xs text-muted-foreground">Registros importados que existen en la plataforma</p><p className="mt-1 text-3xl font-semibold tabular-nums">{data.records.toLocaleString("es-CL")}</p></div>
        <p className="text-xs text-muted-foreground">{data.lastSyncAt?`Última carga con datos: ${formatDateMedium(data.lastSyncAt)}`:"Todavía no hay una carga con datos verificables."}</p>
        {data.errors>0 && <p className="text-sm text-danger">{data.errors} filas no guardadas en el último lote. Revisa Importaciones.</p>}
        <Link className="t-button-primary w-full justify-center" to="/importations">Importar archivo</Link>
      </section>
      {[{name:"ERP Corporativo",Icon:ServerCog,text:"Conecta tu sistema contable cuando dispongas de una integración configurada."},{name:"Integración bancaria",Icon:Landmark,text:"La conexión directa con bancos requiere configurar un proveedor. Los saldos de Excel se cargan desde Importaciones."}].map(({name,Icon,text})=><section className="t-card space-y-4 p-5" key={name}><div className="flex items-center justify-between"><Icon className="text-muted-foreground"/><StatusBadge label="No configurado" tone="muted"/></div><h2 className="font-semibold">{name}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text}</p></section>)}
    </div>
    <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">Analizar un archivo muestra una vista previa. Los datos se guardan al pulsar <strong>Importar</strong> y recibir la confirmación. Un registro antiguo marcado «Sin verificar» no demuestra que haya información cargada.</div>
    <SectionCard title="Historial de sincronizaciones" subtitle="Los registros verificados se comprueban contra las tablas de la plataforma">
      <DataTable data={data.history} rowKey={(h)=>h.id} pageSize={8} columns={[
        {key:"date",header:"Fecha",render:(h)=>formatDateMedium(h.syncedAt)},
        {key:"source",header:"Origen",render:(h)=>h.source==="excel"?"Excel":h.source},
        {key:"records",header:"Registros",align:"right",render:(h)=><span className="tabular-nums">{h.records.toLocaleString("es-CL")}{!h.verified && <span className="ml-1 text-xs text-muted-foreground">declarados</span>}</span>},
        {key:"status",header:"Estado",render:(h)=><StatusBadge label={LABEL[h.status]??"Sin verificar"} tone={TONE[h.status]??"muted"}/>},
        {key:"detail",header:"Detalle",className:"!whitespace-normal min-w-[230px]",render:(h)=><span className="text-xs text-muted-foreground">{h.errorMessage||"Datos guardados y disponibles."}</span>},
      ]}/>
    </SectionCard>
  </div>;
}
