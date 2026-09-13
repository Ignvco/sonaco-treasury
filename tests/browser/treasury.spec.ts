import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { mkdir } from "node:fs/promises";
const uid="10000000-0000-0000-0000-000000000001";
function excel(rows?: unknown[][]) { const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows ?? [["Fecha","Glosa","Debe","Haber","Banco","Moneda"],["13/09/2026","Cobro",45000,0,"BCI","CLP"],["13/09/2026","Pago",0,30000,"BCI","CLP"]]),"Movimientos"); return XLSX.write(wb,{bookType:"xlsx",type:"buffer"}); }
async function setup(page:Page, role="tesoreria", rpcError=false) {
  const api="https://hhksaxwbwbvkoksxfhni.supabase.co";
  const user={id:uid,email:"tesoreria@example.test",aud:"authenticated",role:"authenticated",app_metadata:{provider:"email"},user_metadata:{},created_at:"2026-09-13T10:00:00Z"};
  await page.addInitScript(({user})=>{localStorage.setItem("sb-hhksaxwbwbvkoksxfhni-auth-token",JSON.stringify({access_token:"test-access-token",refresh_token:"test-refresh-token",expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:"bearer",user}));},{user});
  const batches: Record<string,unknown>[]=[]; let saved: Record<string,unknown>[]=[];
  await page.route(`${api}/**`, async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.includes("/auth/v1/")) return route.fulfill({json:user});
    const table=url.pathname.split("/").at(-1);
    if(table==="import_treasury_records") {
      if(rpcError) return route.fulfill({status:404,json:{code:"PGRST202",message:"Function not found"}});
      const body=route.request().postDataJSON();
      saved=body.p_records.map((r:Record<string,unknown>,i:number)=>({id:String(i),import_batch_id:"batch-1",source_sheet:r.sheet,source_row:r.row,status:r.status,entity_type:r.entityType,entity_id:`entity-${i}`,normalized_json:r.normalized,raw_json:r.raw,warnings:r.warnings}));
      const batch={id:"batch-1",file_name:body.p_file_name,status:"completed",total_records:saved.length,valid_records:saved.length,warning_records:0,error_records:0,duplicate_records:0,imported_records:saved.length,created_at:new Date().toISOString()};batches.push(batch);return route.fulfill({json:batch});
    }
    const fixtures:Record<string,unknown>={
      profiles:{...user,name:"Equipo Tesorería",role},
      fx_rates:[{id:"fx-clp",currency:"CLP",rate_to_clp:1},{id:"fx-usd",currency:"USD",rate_to_clp:950}],
      import_batches:batches,import_records:saved,sync_sources:[],sync_history:[],audit_logs:[],
      banks:[{id:"b1",name:"Banco de Chile",status:"activo"},{id:"b2",name:"Banco BCI",status:"activo"},{id:"b3",name:"Banco Santander",status:"activo"}],
      bank_accounts:[{id:"a1",bank_id:"b1",account_number:"0012345678",currency:"CLP",balance:45000000,reconciled_balance:45000000},{id:"a2",bank_id:"b2",account_number:"0098765432",currency:"CLP",balance:18500000,reconciled_balance:18500000},{id:"a3",bank_id:"b3",account_number:"0045678912",currency:"CLP",balance:12800000,reconciled_balance:12750000}],
      cash_flow:[{id:"cf1",date:new Date().toISOString().slice(0,10),type:"income",category:"collection",description:"Cobro de factura · Cliente de prueba",amount:3500000,currency:"CLP",bank_id:"b1",status:"programado"}],
      invoices:[],investments:[],customers:[],projections:[],reconciliations:[],
    };
    let data=fixtures[table??""]??[];
    if(table==="profiles" && !url.searchParams.has("id")) data=[fixtures.profiles];
    return route.fulfill({json:data});
  });
  await page.route("https://api.enter.pro/**",route=>route.abort());
}
test("real browser worker reads Excel, previews and commits a mapped batch", async({page})=>{
  await setup(page); const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/importations");await expect(page.getByRole("heading",{name:"Importaciones",exact:true})).toBeVisible();
  await mkdir("docs/screenshots",{recursive:true});await page.screenshot({animations:"disabled",path:"docs/screenshots/importaciones-desktop.png",fullPage:true});
  await page.getByLabel("Seleccionar archivo Excel").setInputFiles({name:"movimientos.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:excel()});
  await expect(page.getByRole("heading",{name:"Revisa los datos antes de importar"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Importar 2 filas"})).toBeEnabled();
  await page.screenshot({animations:"disabled",path:"docs/screenshots/vista-previa-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Importar 2 filas"}).click();
  await expect(page.getByText("Importación confirmada",{exact:true})).toBeVisible();
  await expect(page.getByText("Detalle — movimientos.xlsx")).toBeVisible();expect(errors).toEqual([]);
});
test("drag and drop works; errors remain visible and rows are not saved early",async({page})=>{
  await setup(page);await page.goto("/importations");await page.getByTestId("excel-dropzone").waitFor();
  const transfer=await page.evaluateHandle((bytes)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],"dropped.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));return dt;},Array.from(excel()));
  await page.getByTestId("excel-dropzone").dispatchEvent("drop",{dataTransfer:transfer});await expect(page.getByRole("button",{name:"Importar 2 filas"})).toBeVisible();await expect(page.getByText("Completado",{exact:true})).toHaveCount(0);
});
test("missing migration shows an actionable error and preserves preview",async({page})=>{
  await setup(page,"tesoreria",true);await page.goto("/importations");await page.getByLabel("Seleccionar archivo Excel").setInputFiles({name:"error.xlsx",mimeType:"application/octet-stream",buffer:excel()});await page.getByRole("button",{name:"Importar 2 filas"}).click();await expect(page.getByRole("alert")).toContainText("Falta actualizar la base de datos");await expect(page.getByRole("button",{name:"Importar 2 filas"})).toBeEnabled();
});
test("mobile pages fit the viewport and all modules are reachable",async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});await page.goto("/importations");await expect(page.getByRole("heading",{name:"Importaciones",exact:true})).toBeVisible();await page.screenshot({animations:"disabled",path:"docs/screenshots/importaciones-mobile.png",fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Abrir navegación"}).click();await expect(page.getByRole("link",{name:"Conciliación",exact:true})).toBeVisible();await page.getByRole("link",{name:"Proyecciones",exact:true}).click();await expect(page.getByRole("heading",{name:"Proyecciones",exact:true})).toBeVisible();
});
test("read-only user sees history without import controls",async({page})=>{await setup(page,"consulta");await page.goto("/importations");await expect(page.getByText("Puedes consultar el historial.",{exact:false})).toBeVisible();await expect(page.getByRole("button",{name:"Seleccionar archivo",exact:true})).toHaveCount(0);});
test("all treasury routes render without runtime errors",async({page})=>{
  await setup(page);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  for(const route of ["dashboard","cashflow","banks","receivables","payments","investments","projections","reconciliation","reports","settings","integrations"]){await page.goto(`/${route}`);await expect(page.locator("main h1")).toBeVisible();await expect(page.getByText("Unexpected Application Error!",{exact:true})).toHaveCount(0);if(route==="dashboard") await page.screenshot({animations:"disabled",path:"docs/screenshots/dashboard-desktop.png",fullPage:true});}
  expect(errors).toEqual([]);
});
