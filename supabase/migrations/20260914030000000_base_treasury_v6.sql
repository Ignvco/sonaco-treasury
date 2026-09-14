alter table public.import_batches add column if not exists base_snapshot_version integer;

-- BASE daily updates. Additive migration after 20260914020000000.
-- Financial entities keep their IDs; every upload keeps an immutable row trace.
create or replace function public.base_business_key(p_kind text, n jsonb)
returns text language sql immutable as $$
 select md5(jsonb_build_array(p_kind,n->>'company',
 case when p_kind='invoice' then null else n->>'ledgerCode' end,
 case when p_kind='invoice' then upper(regexp_replace(coalesce(n->>'rut',n->>'customer',''),'[^a-zA-Z0-9]','','g')) when p_kind in ('cash_flow','projection') then null else n->>'bank' end,
 n->>'document',
 case when p_kind='invoice' then null else n->>'voucher' end,
 case when p_kind='investment' then n->>'startDate' when p_kind='cash_flow' then n->>'date' else null end,
 case when p_kind in ('invoice','cash_flow') then null else n->>'description' end)::text)
$$;
create or replace function public.base_compare_fields(n jsonb)
returns jsonb language sql immutable as $$
 select jsonb_build_object('amount',n->'amount','currency',n->'currency','type',n->'type',
 'bank',n->'bank','settlementBank',n->'settlementBank','ledgerCode',n->'ledgerCode',
 'description',n->'description','category',n->'category','date',n->'date',
 'issueDate',n->'issueDate','dueDate',n->'dueDate','reportDate',n->'reportDate',
 'adjustedDate',n->'adjustedDate','startDate',n->'startDate','endDate',n->'endDate',
 'rate',n->'rate','interest',n->'interest','status',n->'status')
$$;

create or replace view public.base_current_records with (security_invoker=true) as
with latest as (
 select distinct on (r.entity_type,r.entity_id) r.*, b.file_name,b.created_at as uploaded_at,
   case r.entity_type when 'cash_flow' then to_jsonb(c) when 'invoice' then to_jsonb(i)
     when 'investment' then to_jsonb(v) when 'projection' then to_jsonb(p) end as entity
 from public.import_records r join public.import_batches b on b.id=r.import_batch_id
 left join public.cash_flow c on r.entity_type='cash_flow' and c.id=r.entity_id
 left join public.invoices i on r.entity_type='invoice' and i.id=r.entity_id
 left join public.investments v on r.entity_type='investment' and v.id=r.entity_id
 left join public.projections p on r.entity_type='projection' and p.id=r.entity_id
 where upper(trim(r.source_sheet))='BASE' and r.normalized_json->>'sourceProfile' like 'BASE-ONLY-%'
 and r.status in ('VALID','WARNING','DUPLICATE') and coalesce(c.id,i.id,v.id,p.id) is not null
 order by r.entity_type,r.entity_id,b.created_at desc,r.created_at desc,r.id desc
)
select *, normalized_json || jsonb_strip_nulls(jsonb_build_object(
 'amount',entity->'amount','currency',entity->'currency',
 'date',entity->'date','issueDate',entity->'issue_date','dueDate',entity->'due_date',
 'startDate',entity->'start_date','endDate',entity->'end_date'
)) as current_normalized
from latest;
grant select on public.base_current_records to authenticated;

create or replace function public.compare_base_import(p_records jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 r jsonb; n jsonb; k text; item jsonb; candidate jsonb; candidates jsonb;
 result jsonb:='[]'; used_ids text[]:='{}'; incoming_count int; decision text; revision text;
 groups jsonb; exact_rows jsonb; incoming_counts jsonb; exact_assignments jsonb:='{}';
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Registros inválidos.'; end if;
 if jsonb_array_length(p_records)>20000 or octet_length(p_records::text)>25000000 then raise exception 'Lote demasiado grande.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) where coalesce(value->>'row','') !~ '^[1-9][0-9]{0,6}$') then
  raise exception 'Filas BASE inválidas.';
 end if;
 if exists(select 1 from jsonb_array_elements(p_records) where (value->>'row')::int>1048576) then raise exception 'Fila fuera de BASE.'; end if;
 if (select count(distinct value->>'row') from jsonb_array_elements(p_records))<>jsonb_array_length(p_records) then
  raise exception 'Hay filas BASE repetidas en la solicitud.';
 end if;
 if exists(select 1 from jsonb_array_elements(p_records) where value->>'status' in ('VALID','WARNING')
   group by value->'normalized'->>'sourceId' having count(*)>1) then
  raise exception 'La solicitud contiene identificadores BASE repetidos. Vuelve a analizar el archivo.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('entity_type',v.entity_type,'entity_id',v.entity_id,
   'normalized_json',v.normalized_json,'current_normalized',v.current_normalized,'entity_revision',md5(v.entity::text))
   order by v.entity_type,v.entity_id),'[]') into candidates from public.base_current_records v;
 select coalesce(jsonb_object_agg(g.identity_key,g.items),'{}') into groups from (
   select public.base_business_key(value->>'entity_type',value->'normalized_json') identity_key,jsonb_agg(value) items
   from jsonb_array_elements(candidates) group by 1) g;
 select coalesce(jsonb_object_agg(g.source_id,g.items),'{}') into exact_rows from (
   select value->'normalized_json'->>'sourceId' source_id,jsonb_agg(value) items
   from jsonb_array_elements(candidates) where value->'normalized_json'->>'sourceId' is not null group by 1) g;

 -- Reserve exact identities throughout the file before matching corrections.
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'status' in ('VALID','WARNING') and upper(trim(r->>'sheet'))='BASE'
    and coalesce(r->'normalized'->>'sourceProfile','') like 'BASE-ONLY-%'
    and r->>'entityType' in ('cash_flow','invoice','investment','projection') then
   n:=r->'normalized'; k:=public.base_business_key(r->>'entityType',n);
   select coalesce(jsonb_agg(value),'[]') into item from jsonb_array_elements(coalesce(exact_rows->(n->>'sourceId'),'[]'))
   where value->>'entity_type'=r->>'entityType' and not(value->>'entity_id'=any(used_ids))
    and public.base_business_key(value->>'entity_type',value->'normalized_json')=k;
   if jsonb_array_length(item)=1 then
    exact_assignments:=exact_assignments||jsonb_build_object(r->>'row',item->0);
    used_ids:=array_append(used_ids,item->0->>'entity_id');
   end if;
  end if;
 end loop;
 select coalesce(jsonb_object_agg(g.identity_key,g.row_count),'{}') into incoming_counts from (
   select public.base_business_key(value->>'entityType',value->'normalized') identity_key,count(*) row_count
   from jsonb_array_elements(p_records) where not(exact_assignments ? (value->>'row'))
    and value->>'status' in ('VALID','WARNING') and upper(trim(value->>'sheet'))='BASE'
    and coalesce(value->'normalized'->>'sourceProfile','') like 'BASE-ONLY-%'
    and value->>'entityType' in ('cash_flow','invoice','investment','projection') group by 1) g;

 for r in select value from jsonb_array_elements(p_records) loop
  n:=r->'normalized'; candidate:=null; decision:='new';
  if upper(trim(r->>'sheet')) is distinct from 'BASE' or coalesce(n->>'sourceProfile','') not like 'BASE-ONLY-%'
    or coalesce(r->>'entityType','') not in ('cash_flow','invoice','investment','projection')
    or coalesce(r->>'status','') not in ('VALID','WARNING') then
   decision:='invalid';
  else
   k:=public.base_business_key(r->>'entityType',n);
   candidate:=exact_assignments->(r->>'row');
   if candidate is null then
    select coalesce(jsonb_agg(value),'[]') into item from jsonb_array_elements(coalesce(groups->k,'[]'))
    where not(value->>'entity_id'=any(used_ids));
    incoming_count:=coalesce((incoming_counts->>k)::int,0);
    if jsonb_array_length(item)=1 and incoming_count=1 then candidate:=item->0;
    elsif jsonb_array_length(item)>0 then decision:='conflict'; end if;
   end if;
   if candidate is not null then
    if not(candidate->>'entity_id'=any(used_ids)) then used_ids:=array_append(used_ids,candidate->>'entity_id'); end if;
    decision:=case when public.base_compare_fields(candidate->'current_normalized')=public.base_compare_fields(n) then 'unchanged' else 'modified' end;
   end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('row',r->'row','change',decision,
    'entityId',candidate->'entity_id','before',candidate->'current_normalized','after',n,
    'reason',case when decision='conflict' then 'Varias partidas podrían corresponder a esta fila. Se conserva lo guardado; revisa el comprobante.' else null end));
 end loop;
 select md5(coalesce(string_agg(value::text,'' order by value->>'entity_id'),'')||p_records::text)
 into revision from jsonb_array_elements(candidates);
 return jsonb_build_object('revision',revision,'rows',result);
end; $$;
revoke all on function public.compare_base_import(jsonb) from public,anon;
grant execute on function public.compare_base_import(jsonb) to authenticated;

create or replace function public.import_base_changes(p_file_name text, p_file_hash text, p_records jsonb, p_revision text, p_apply_rows int[])
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_batch public.import_batches%rowtype;
  v_plan jsonb; v_decision jsonb; v_match uuid;
  v_rec jsonb; n jsonb; v_kind text; v_status text; v_warning text;
  v_entity uuid; v_bank uuid; v_customer uuid; v_record uuid;
  v_key text; v_name text; v_rut text; v_currency text; v_type text; v_entity_status text;
  v_amount numeric; v_date date; v_issue date; v_due date;
  v_actor text; v_existing int; v_start timestamptz := clock_timestamp();
begin
  if auth.uid() is null or coalesce(public.current_role(),'') not in ('administrador','tesoreria') then
    raise exception 'Tu rol no permite importar archivos.' using errcode = '42501';
  end if;
  if p_file_name is null or length(trim(p_file_name)) = 0 or length(p_file_name) > 255
    or p_file_hash is null or p_file_hash !~ '^[a-f0-9]{64}$' then raise exception 'Archivo o huella inválidos.'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Registros inválidos.'; end if;
  if jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 20000 or octet_length(p_records::text) > 25000000 then
    raise exception 'El lote debe contener entre 1 y 20.000 filas y no superar 25 MB de datos.';
  end if;
  -- Serialize imports for this single-company installation; covers different files with overlapping rows.
  perform pg_advisory_xact_lock(728394106);
  lock table public.cash_flow, public.invoices, public.investments, public.projections, public.import_records in share row exclusive mode;
  select * into v_batch from public.import_batches where file_hash = p_file_hash;
  if found then return to_jsonb(v_batch); end if;
  v_plan := public.compare_base_import(p_records);
  if v_plan->>'revision' is distinct from p_revision then raise exception 'Los datos cambiaron desde la vista previa. Vuelve a analizar el archivo antes de guardar.'; end if;
  select coalesce(name,email,'Usuario') into v_actor from public.profiles where id = auth.uid();
  insert into public.import_batches(file_name,file_hash,source,uploaded_by,uploaded_by_id,status,total_records,base_snapshot_version)
  values(p_file_name,p_file_hash,'excel',v_actor,auth.uid(),'processing',jsonb_array_length(p_records),1) returning * into v_batch;

  for v_rec in select value from jsonb_array_elements(p_records) loop
    n := (v_rec->'normalized') - '_keptEntityId'; v_kind := v_rec->>'entityType';
    v_status := coalesce(v_rec->>'status','ERROR'); v_warning := coalesce(v_rec->>'warnings','');
    v_entity := null; v_bank := null; v_customer := null; v_key := null; v_match := null;
    select value into v_decision from jsonb_array_elements(v_plan->'rows') where (value->>'row')::int=(v_rec->>'row')::int;
    if v_decision->>'change'='modified' and not ((v_rec->>'row')::int=any(coalesce(p_apply_rows,'{}'))) then
      v_status:='DUPLICATE'; v_warning:='Cambio omitido por el usuario. Se conserva el registro anterior.';
      n:=n||jsonb_build_object('_keptEntityId',v_decision->>'entityId');
    elsif v_decision->>'change'='conflict' then
      v_status:='ERROR'; v_warning:=v_decision->>'reason';
    elsif v_decision->>'change'='invalid' then
      v_status:='ERROR';
    else
      v_match:=nullif(v_decision->>'entityId','')::uuid;
    end if;
    if v_status not in ('VALID','WARNING','ERROR','DUPLICATE') then v_status := 'ERROR'; end if;
    if v_kind is null or v_kind not in ('customer','invoice','cash_flow','investment','projection','bank_account') then
      v_status := 'ERROR'; v_warning := 'Destino no compatible: revisa el tipo de hoja.';
    end if;
    if v_status in ('VALID','WARNING') then
      -- Per-row savepoint: a failed invoice never leaves orphan banks/customers behind.
      begin
        if jsonb_typeof(n) is distinct from 'object' then raise exception 'Datos normalizados inválidos'; end if;
        v_currency := coalesce(nullif(n->>'currency',''),'CLP');
        if v_currency not in ('CLP','USD','UF','UTM') then raise exception 'Moneda no compatible'; end if;
        v_type := coalesce(n->>'type','income');
        v_amount := nullif(n->>'amount','')::numeric;
        if v_kind not in ('customer','bank_account') and (v_amount is null or v_amount <= 0 or v_amount::text in ('NaN','Infinity','-Infinity')) then raise exception 'Monto inválido'; end if;
        v_name := nullif(trim(n->>'customer'),'');
        v_rut := nullif(upper(regexp_replace(coalesce(n->>'rut',''),'[^0-9kK]','','g')),'');
        -- Compute identity on the server; ignore any client-supplied dedupe key.
        v_key := md5(jsonb_build_array(v_kind, n->>'document', lower(v_name), v_rut,
          n->>'account', lower(n->>'bank'), v_currency, v_amount, v_type,
          n->>'date', n->>'issueDate', n->>'dueDate', n->>'startDate', n->>'endDate',
          n->>'description', n->>'rate', n->>'interest')::text);
        if nullif(n->>'sourceId','') is not null then v_key := md5(v_key || ':' || (n->>'sourceId')); end if;
        if v_kind='bank_account' then v_key := md5(v_key || jsonb_build_array(n->>'ledgerCode',n->>'balance',n->>'reconciledBalance')::text); end if;
        -- BASE references a source row in its cached formula metadata. Bridge
        -- records created by the preceding importer without reopening that sheet
        -- or inserting a second financial entity. Require matching business data.
        v_existing := 0;
        if n->>'sourceProfile' like 'BASE-ONLY-%' and nullif(n->>'legacyRow','') is not null then
          select count(distinct r.entity_id),(array_agg(distinct r.entity_id))[1] into v_existing,v_entity
          from public.import_records r join public.verified_import_records vr on vr.id=r.id
          where r.source_sheet=n->>'legacySheet' and r.source_row=(n->>'legacyRow')::int
            and r.entity_type=v_kind
            and (r.normalized_json->>'sourceProfile') is null
            and r.normalized_json->>'currency'=v_currency
            and (r.normalized_json->>'amount')::numeric=v_amount
            and (v_kind='invoice' or lower(coalesce(r.normalized_json->>'bank',''))=lower(coalesce(n->>'bank','')))
            and (
              (v_kind='cash_flow' and r.normalized_json->>'date'=n->>'date'
                and r.normalized_json->>'type'=v_type
                and coalesce(r.normalized_json->>'description','')=coalesce(n->>'description','')) or
              (v_kind='projection' and r.normalized_json->>'date'=n->>'date' and r.normalized_json->>'type'=v_type) or
              (v_kind='invoice' and r.normalized_json->>'document'=n->>'document'
                and lower(r.normalized_json->>'customer')=lower(v_name)
                and r.normalized_json->>'issueDate'=n->>'issueDate'
                and r.normalized_json->>'dueDate'=n->>'dueDate') or
              (v_kind='investment' and r.normalized_json->>'startDate'=n->>'startDate'
                and r.normalized_json->>'endDate'=n->>'endDate')
            );
          if v_existing>1 then raise exception 'Hay varias coincidencias de una importación anterior. Revisa los duplicados existentes'; end if;
        end if;
        if v_decision->>'change'='unchanged' then
          v_status:='DUPLICATE'; v_entity:=v_match; v_key:=null; v_warning:='Sin cambios respecto del registro guardado.';
        elsif v_match is null and (v_existing=1 or exists(select 1 from public.import_records where dedupe_key=v_key and entity_id is not null and status in ('VALID','WARNING'))) then
          v_status := 'DUPLICATE'; v_warning := 'Registro ya importado en un archivo anterior.';
        else
          if v_kind in ('customer','invoice') then
            if v_name is null then raise exception 'Falta el nombre del cliente'; end if;
            if v_rut is not null then
              select count(*), (array_agg(id))[1] into v_existing,v_customer from public.customers
              where upper(regexp_replace(coalesce(rut,''),'[^0-9kK]','','g'))=v_rut;
            else
              select count(*), (array_agg(id))[1] into v_existing,v_customer from public.customers where lower(trim(name))=lower(v_name);
            end if;
            if v_existing > 1 then raise exception 'Cliente ambiguo: revisa los clientes duplicados antes de importar'; end if;
            if v_customer is null then
              insert into public.customers(name,rut,type,status) values(v_name,nullif(n->>'rut',''),'Importado','activo') returning id into v_customer;
            end if;
          end if;
          if v_kind in ('cash_flow','projection','investment','bank_account') and nullif(trim(n->>'bank'),'') is not null then
            select count(*),(array_agg(id))[1] into v_existing,v_bank from public.banks where lower(trim(name))=lower(trim(n->>'bank'));
            if v_existing > 1 then raise exception 'Banco ambiguo: revisa el catálogo de bancos'; end if;
            if v_bank is null then insert into public.banks(name,status) values(trim(n->>'bank'),'activo') returning id into v_bank; end if;
          end if;
          v_entity_status := nullif(n->>'status','');
          v_entity:=v_match;
          v_key:=md5(v_key||v_batch.id::text);
          case v_kind
          when 'bank_account' then
            v_date := nullif(n->>'date','')::date;
            if v_bank is null or nullif(n->>'ledgerCode','') is null or v_date is null or v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'Banco, código contable o fecha de saldo inválidos'; end if;
            if (n->>'balance')::numeric is null or (n->>'reconciledBalance')::numeric is null or
              (n->>'balance')::numeric::text in ('NaN','Infinity','-Infinity') or (n->>'reconciledBalance')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Saldos inválidos'; end if;
            select count(*),(array_agg(id))[1] into v_existing,v_entity from public.bank_accounts
              where bank_id=v_bank and currency=v_currency and
                (ledger_code=n->>'ledgerCode' or (nullif(n->>'account','') is not null and account_number=n->>'account'));
            if v_existing > 1 then raise exception 'Cuenta ambigua: revisa cuentas duplicadas'; end if;
            if v_entity is null then
              insert into public.bank_accounts(bank_id,account_number,ledger_code,currency,balance,reconciled_balance,balance_date,last_reconciliation)
              values(v_bank,nullif(n->>'account',''),n->>'ledgerCode',v_currency,(n->>'balance')::numeric,(n->>'reconciledBalance')::numeric,v_date,v_date) returning id into v_entity;
            else
              if exists(select 1 from public.bank_accounts where id=v_entity and (greatest(balance_date,last_reconciliation)>v_date or
                (balance_date=v_date and (balance<>(n->>'balance')::numeric or reconciled_balance<>(n->>'reconciledBalance')::numeric)))) then
                raise exception 'Ya existe un saldo más reciente o diferente para la misma fecha; se conserva el saldo guardado';
              end if;
              update public.bank_accounts set account_number=coalesce(nullif(n->>'account',''),account_number),ledger_code=n->>'ledgerCode',
                balance=(n->>'balance')::numeric,reconciled_balance=(n->>'reconciledBalance')::numeric,balance_date=v_date,last_reconciliation=v_date where id=v_entity;
            end if;
          when 'customer' then
            v_entity := v_customer;
          when 'invoice' then
            if nullif(n->>'document','') is null or n->>'document'='0' then raise exception 'Documento inválido'; end if;
            v_issue := nullif(n->>'issueDate','')::date; v_due := nullif(n->>'dueDate','')::date;
            if v_issue is null or v_due is null or v_due < v_issue or v_issue < date '2000-01-01' or v_due > date '2100-12-31' then raise exception 'Fechas de factura inválidas'; end if;
            v_entity_status := coalesce(v_entity_status,case when v_due < current_date then 'vencido' else 'por_vencer' end);
            if v_entity_status not in ('por_vencer','vencido','pagado','vence_pronto') then raise exception 'Estado de factura inválido'; end if;
            if exists(select 1 from public.invoices where customer_id=v_customer and document=n->>'document' and (v_match is null or id<>v_match)) then raise exception 'Ya existe este documento para el cliente. Revisa la factura existente'; end if;
            if v_match is not null then
              update public.invoices set amount=v_amount,currency=v_currency,issue_date=v_issue,due_date=v_due where id=v_match returning id into v_entity;
            else
            insert into public.invoices(customer_id,document,issue_date,due_date,amount,currency,status)
            values(v_customer,n->>'document',v_issue,v_due,v_amount,v_currency,v_entity_status) returning id into v_entity;
            end if;
          when 'cash_flow' then
            v_date := nullif(n->>'date','')::date;
            if v_date is null or v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'Fecha de movimiento inválida'; end if;
            v_entity_status := coalesce(v_entity_status,'conciliado');
            if v_entity_status not in ('conciliado','confirmado','programado','pendiente','proyectado','borrador','pagado','cancelado','vencido') then raise exception 'Estado de movimiento inválido'; end if;
            if v_match is not null then
              update public.cash_flow set date=v_date,type=v_type,category=coalesce(n->>'category',category),description=coalesce(n->>'description',description),amount=v_amount,currency=v_currency,bank_id=v_bank,status=v_entity_status where id=v_match returning id into v_entity;
            else
            insert into public.cash_flow(date,type,category,description,amount,currency,bank_id,status,origin)
            values(v_date,v_type,coalesce(nullif(n->>'category',''),case when v_type='expense' then 'supplier' else 'other_income' end),coalesce(nullif(n->>'description',''),'Movimiento importado'),v_amount,v_currency,v_bank,v_entity_status,'excel') returning id into v_entity;
            end if;
            -- Accounts use the full identifier; masking belongs to presentation only.
            if v_bank is not null and nullif(n->>'account','') is not null and not exists
              (select 1 from public.bank_accounts where bank_id=v_bank and account_number=n->>'account' and currency=v_currency) then
              insert into public.bank_accounts(bank_id,account_number,currency) values(v_bank,n->>'account',v_currency);
            end if;
          when 'projection' then
            v_date := nullif(n->>'date','')::date;
            if v_date is null or v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'Fecha de proyección inválida'; end if;
            v_entity_status := coalesce(v_entity_status,'proyectado');
            if v_entity_status not in ('proyectado','confirmado','cancelado','borrador') then raise exception 'Estado de proyección inválido'; end if;
            if v_match is not null then
              update public.projections set date=v_date,type=v_type,category=coalesce(n->>'category',category),description=coalesce(n->>'description',description),amount=v_amount,currency=v_currency,bank_id=v_bank where id=v_match returning id into v_entity;
            else
            insert into public.projections(date,type,category,description,amount,currency,bank_id,status)
            values(v_date,v_type,coalesce(n->>'category','other_income'),coalesce(nullif(n->>'description',''),'Proyección importada'),v_amount,v_currency,v_bank,v_entity_status) returning id into v_entity;
            end if;
          when 'investment' then
            v_issue := nullif(n->>'startDate','')::date; v_due := nullif(n->>'endDate','')::date;
            if v_issue is null or v_due is null or v_due < v_issue or v_issue < date '2000-01-01' or v_due > date '2100-12-31' then raise exception 'Fechas de inversión inválidas'; end if;
            v_entity_status := coalesce(v_entity_status,'vigente');
            if v_entity_status not in ('vigente','por_vencer','rescatada','rescate_programado') then raise exception 'Estado de inversión inválido'; end if;
            if v_match is not null then
              update public.investments set bank_id=v_bank,type=coalesce(n->>'investmentType',type),amount=v_amount,currency=v_currency,start_date=v_issue,end_date=v_due,rate=coalesce((n->>'rate')::numeric,0),estimated_interest=coalesce((n->>'interest')::numeric,0),rate_known=coalesce((n->>'rateKnown')::boolean,false) where id=v_match returning id into v_entity;
            else
            insert into public.investments(bank_id,type,amount,currency,start_date,end_date,rate,estimated_interest,status,rate_known)
            values(v_bank,coalesce(n->>'investmentType','colocacion'),v_amount,v_currency,v_issue,v_due,coalesce((n->>'rate')::numeric,0),coalesce((n->>'interest')::numeric,0),v_entity_status,coalesce((n->>'rateKnown')::boolean,n->>'rate' is not null)) returning id into v_entity;
            end if;
          else raise exception 'Entidad no compatible';
          end case;
        end if;
      exception when others then
        v_status := 'ERROR'; v_entity := null; v_key := null;
        v_warning := concat_ws(' · ',nullif(v_warning,''),'No guardado: ' || SQLERRM);
      end;
    end if;
    insert into public.import_records(import_batch_id,source_sheet,source_row,status,entity_type,entity_id,raw_json,normalized_json,warnings,dedupe_key)
    values(v_batch.id,left(v_rec->>'sheet',255),greatest(1,(v_rec->>'row')::int),v_status,v_kind,v_entity,v_rec->'raw',n,nullif(v_warning,''),case when v_entity is not null then v_key else null end)
    returning id into v_record;
    if v_kind='cash_flow' and v_entity is not null then update public.cash_flow set import_record_id=v_record where id=v_entity; end if;
  end loop;

  update public.import_batches b set
    valid_records=(select count(*) from public.import_records where import_batch_id=b.id and status='VALID'),
    warning_records=(select count(*) from public.import_records where import_batch_id=b.id and status='WARNING'),
    error_records=(select count(*) from public.import_records where import_batch_id=b.id and status='ERROR'),
    duplicate_records=(select count(*) from public.import_records where import_batch_id=b.id and status='DUPLICATE'),
    imported_records=(select count(*) from public.import_records where import_batch_id=b.id and entity_id is not null and status in ('VALID','WARNING'))
  where b.id=v_batch.id returning * into v_batch;
  update public.import_batches set status=case when v_batch.error_records=0 then 'completed' when v_batch.imported_records=0 then 'failed' else 'partial' end
  where id=v_batch.id returning * into v_batch;
  insert into public.audit_logs(actor,role,action,entity,new_value)
  values(v_actor,public.current_role(),'Importó archivo Excel','Importación',p_file_name || ' · ' || v_batch.imported_records || ' guardados · ' || v_batch.error_records || ' errores');
  insert into public.sync_sources(source,name,status,enabled,last_sync_at,records_synced,errors)
  values('excel','Excel','connected',true,now(),v_batch.imported_records,v_batch.error_records)
  on conflict(source) do update set last_sync_at=excluded.last_sync_at,records_synced=excluded.records_synced,errors=excluded.errors,status='connected';
  insert into public.sync_history(source,records,duration_seconds,status,error_message,import_batch_id)
  values('excel',v_batch.imported_records,extract(epoch from clock_timestamp()-v_start),case when v_batch.status='completed' then 'Success' when v_batch.status='failed' then 'Error' else 'Warning' end,
    case when v_batch.error_records>0 then v_batch.error_records || ' filas no guardadas. Consulta el detalle.' else null end,v_batch.id);
  return to_jsonb(v_batch);
end; $$;
revoke all on function public.import_base_changes(text,text,jsonb,text,int[]) from public, anon;
grant execute on function public.import_base_changes(text,text,jsonb,text,int[]) to authenticated;


notify pgrst, 'reload schema';

-- Explicit forecast links prevent counting the same expected payment twice.
create table if not exists public.forecast_links (
 id uuid primary key default gen_random_uuid(),
 projection_id uuid not null references public.projections(id) on delete cascade,
 target_kind text not null check (target_kind in ('invoice','investment')),
 target_id uuid not null,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(projection_id)
);
alter table public.forecast_links enable row level security;
drop policy if exists forecast_links_read on public.forecast_links;
create policy forecast_links_read on public.forecast_links for select to authenticated using(true);
drop policy if exists forecast_links_write on public.forecast_links;
create policy forecast_links_write on public.forecast_links for all to authenticated
 using(public.current_role() in ('administrador','tesoreria'))
 with check(public.current_role() in ('administrador','tesoreria') and created_by=auth.uid());
grant select,insert,update,delete on public.forecast_links to authenticated;
notify pgrst,'reload schema';

create unique index if not exists forecast_links_target on public.forecast_links(target_kind,target_id);
create or replace function public.check_forecast_link() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.projections%rowtype; a numeric; c text;
begin
 select * into p from public.projections where id=new.projection_id;
 if new.target_kind='invoice' then select amount,currency into a,c from public.invoices where id=new.target_id;
 else select amount+case when rate_known then estimated_interest else 0 end,currency into a,c from public.investments where id=new.target_id; end if;
 if a is null or p.type<>'income' or p.currency<>c or abs(p.amount-a)>0.005 then
 raise exception 'Vincula solo una proyección del mismo importe y moneda que el cobro o rescate.'; end if;
 return new;
end; $$;
drop trigger if exists forecast_link_valid on public.forecast_links;
create trigger forecast_link_valid before insert or update on public.forecast_links for each row execute function public.check_forecast_link();
-- One consistent database snapshot, without PostgREST row-page truncation.
create or replace function public.get_base_treasury_snapshot()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with snapshot as (
  select id,created_at from public.import_batches where base_snapshot_version=1 and status in ('completed','partial') order by created_at desc limit 1
 )
 select jsonb_build_object(
  'traces',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'entity_id',v.entity_id,'entity_type',v.entity_type,
    'current_normalized',v.current_normalized,'entity',v.entity,'file_name',v.file_name,'source_row',v.source_row,
    'in_latest',not exists(select 1 from snapshot) or exists(
      select 1 from public.import_records r join snapshot s on s.id=r.import_batch_id
      where r.entity_type=v.entity_type and (r.entity_id=v.entity_id or r.normalized_json->>'_keptEntityId'=v.entity_id::text)
    ))),'[]') from public.base_current_records v),
  'projections',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.projections p
    where not exists(select 1 from public.import_records r where r.entity_type='projection' and r.entity_id=p.id and r.status in ('VALID','WARNING','DUPLICATE'))),
  'manual_cash_flow',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.cash_flow c
    where coalesce(c.origin,'manual')='manual' and not exists(select 1 from public.import_records r where r.entity_type='cash_flow' and r.entity_id=c.id)),
  'links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.forecast_links l),
  'banks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.banks b),
  'latest_batch',(select to_jsonb(b) from public.import_batches b where exists(
    select 1 from public.import_records r where r.import_batch_id=b.id and upper(trim(r.source_sheet))='BASE')
    order by b.created_at desc limit 1)
 )
$$;
revoke all on function public.get_base_treasury_snapshot() from public,anon;
grant execute on function public.get_base_treasury_snapshot() to authenticated;
notify pgrst,'reload schema';

create index if not exists import_records_entity_trace_v6
 on public.import_records(entity_type,entity_id,created_at desc)
 where entity_id is not null;
