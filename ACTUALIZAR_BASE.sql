-- Ejecutar completo en el SQL Editor del Supabase conectado a la app.
BEGIN;
-- Non-destructive upgrade. Apply after v1/v2; do not replay cleanup migrations on live data.
-- Import writes and audit commit in one transaction. Every accepted row has an entity id.

alter table public.profiles alter column role set default 'consulta';
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,role,name)
  values(new.id,new.email,'consulta',coalesce(new.raw_user_meta_data->>'name',split_part(coalesce(new.email,'usuario'),'@',1)))
  on conflict(id) do nothing;
  return new;
end; $$;

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'consulta');
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.current_role(),'consulta') <> 'administrador'
    and (new.role is distinct from old.role or new.id is distinct from old.id) then
    raise exception 'Solo un administrador puede cambiar roles.' using errcode = '42501';
  end if;
  if new.role not in ('administrador','tesoreria','contabilidad','consulta') then
    raise exception 'Rol inválido';
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
for each row execute function public.protect_profile_role();

alter table public.import_batches add column if not exists file_hash text;
alter table public.import_batches add column if not exists imported_records int not null default 0;
alter table public.import_batches add column if not exists uploaded_by_id uuid references auth.users(id);
alter table public.import_records add column if not exists dedupe_key text;
create unique index if not exists import_batches_file_hash_unique on public.import_batches(file_hash) where file_hash is not null;
create unique index if not exists import_records_dedupe_unique on public.import_records(dedupe_key) where entity_id is not null and dedupe_key is not null and status in ('VALID','WARNING');

-- The RPC is SECURITY INVOKER, so table permissions still apply.
drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches for insert to authenticated
with check (public.current_role() in ('administrador','tesoreria') and uploaded_by_id = auth.uid());
drop policy if exists import_batches_update on public.import_batches;
create policy import_batches_update on public.import_batches for update to authenticated
using (public.current_role() in ('administrador','tesoreria')) with check (public.current_role() in ('administrador','tesoreria'));
drop policy if exists import_records_insert on public.import_records;
create policy import_records_insert on public.import_records for insert to authenticated
with check (public.current_role() in ('administrador','tesoreria'));
drop policy if exists sync_sources_insert on public.sync_sources;
create policy sync_sources_insert on public.sync_sources for insert to authenticated
with check (public.current_role() in ('administrador','tesoreria'));
drop policy if exists sync_history_insert on public.sync_history;
create policy sync_history_insert on public.sync_history for insert to authenticated
with check (public.current_role() in ('administrador','tesoreria'));

create or replace function public.import_treasury_records(p_file_name text, p_file_hash text, p_records jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_batch public.import_batches%rowtype;
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
  select * into v_batch from public.import_batches where file_hash = p_file_hash;
  if found then return to_jsonb(v_batch); end if;
  select coalesce(name,email,'Usuario') into v_actor from public.profiles where id = auth.uid();
  insert into public.import_batches(file_name,file_hash,source,uploaded_by,uploaded_by_id,status,total_records)
  values(p_file_name,p_file_hash,'excel',v_actor,auth.uid(),'processing',jsonb_array_length(p_records)) returning * into v_batch;

  for v_rec in select value from jsonb_array_elements(p_records) loop
    n := v_rec->'normalized'; v_kind := v_rec->>'entityType';
    v_status := coalesce(v_rec->>'status','ERROR'); v_warning := coalesce(v_rec->>'warnings','');
    v_entity := null; v_bank := null; v_customer := null; v_key := null;
    if v_status not in ('VALID','WARNING','ERROR','DUPLICATE') then v_status := 'ERROR'; end if;
    if v_kind is null or v_kind not in ('customer','invoice','cash_flow','investment','projection') then
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
        if v_kind <> 'customer' and (v_amount is null or v_amount <= 0 or v_amount::text in ('NaN','Infinity','-Infinity')) then raise exception 'Monto inválido'; end if;
        v_name := nullif(trim(n->>'customer'),'');
        v_rut := nullif(upper(regexp_replace(coalesce(n->>'rut',''),'[^0-9kK]','','g')),'');
        -- Compute identity on the server; ignore any client-supplied dedupe key.
        v_key := md5(jsonb_build_array(v_kind, n->>'document', lower(v_name), v_rut,
          n->>'account', lower(n->>'bank'), v_currency, v_amount, v_type,
          n->>'date', n->>'issueDate', n->>'dueDate', n->>'startDate', n->>'endDate',
          n->>'description', n->>'rate', n->>'interest')::text);
        if exists(select 1 from public.import_records where dedupe_key=v_key and entity_id is not null and status in ('VALID','WARNING')) then
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
          if v_kind in ('cash_flow','projection','investment') and nullif(trim(n->>'bank'),'') is not null then
            select count(*),(array_agg(id))[1] into v_existing,v_bank from public.banks where lower(trim(name))=lower(trim(n->>'bank'));
            if v_existing > 1 then raise exception 'Banco ambiguo: revisa el catálogo de bancos'; end if;
            if v_bank is null then insert into public.banks(name,status) values(trim(n->>'bank'),'activo') returning id into v_bank; end if;
          end if;
          v_entity_status := nullif(n->>'status','');
          case v_kind
          when 'customer' then
            v_entity := v_customer;
          when 'invoice' then
            if nullif(n->>'document','') is null or n->>'document'='0' then raise exception 'Documento inválido'; end if;
            v_issue := nullif(n->>'issueDate','')::date; v_due := nullif(n->>'dueDate','')::date;
            if v_issue is null or v_due is null or v_due < v_issue or v_issue < date '2000-01-01' or v_due > date '2100-12-31' then raise exception 'Fechas de factura inválidas'; end if;
            v_entity_status := coalesce(v_entity_status,case when v_due < current_date then 'vencido' else 'por_vencer' end);
            if v_entity_status not in ('por_vencer','vencido','pagado','vence_pronto') then raise exception 'Estado de factura inválido'; end if;
            if exists(select 1 from public.invoices where customer_id=v_customer and document=n->>'document') then raise exception 'Ya existe este documento para el cliente. Revisa la factura existente'; end if;
            insert into public.invoices(customer_id,document,issue_date,due_date,amount,currency,status)
            values(v_customer,n->>'document',v_issue,v_due,v_amount,v_currency,v_entity_status) returning id into v_entity;
          when 'cash_flow' then
            v_date := nullif(n->>'date','')::date;
            if v_date is null or v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'Fecha de movimiento inválida'; end if;
            v_entity_status := coalesce(v_entity_status,'conciliado');
            if v_entity_status not in ('conciliado','confirmado','programado','pendiente','proyectado','borrador','pagado','cancelado','vencido') then raise exception 'Estado de movimiento inválido'; end if;
            insert into public.cash_flow(date,type,category,description,amount,currency,bank_id,status,origin)
            values(v_date,v_type,coalesce(nullif(n->>'category',''),case when v_type='expense' then 'supplier' else 'other_income' end),coalesce(nullif(n->>'description',''),'Movimiento importado'),v_amount,v_currency,v_bank,v_entity_status,'excel') returning id into v_entity;
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
            insert into public.projections(date,type,category,description,amount,currency,bank_id,status)
            values(v_date,v_type,coalesce(n->>'category','other_income'),coalesce(nullif(n->>'description',''),'Proyección importada'),v_amount,v_currency,v_bank,v_entity_status) returning id into v_entity;
          when 'investment' then
            v_issue := nullif(n->>'startDate','')::date; v_due := nullif(n->>'endDate','')::date;
            if v_issue is null or v_due is null or v_due < v_issue or v_issue < date '2000-01-01' or v_due > date '2100-12-31' then raise exception 'Fechas de inversión inválidas'; end if;
            v_entity_status := coalesce(v_entity_status,'vigente');
            if v_entity_status not in ('vigente','por_vencer','rescatada','rescate_programado') then raise exception 'Estado de inversión inválido'; end if;
            insert into public.investments(bank_id,type,amount,currency,start_date,end_date,rate,estimated_interest,status)
            values(v_bank,coalesce(n->>'investmentType','colocacion'),v_amount,v_currency,v_issue,v_due,coalesce((n->>'rate')::numeric,0),coalesce((n->>'interest')::numeric,0),v_entity_status) returning id into v_entity;
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
    imported_records=(select count(*) from public.import_records where import_batch_id=b.id and entity_id is not null)
  where b.id=v_batch.id returning * into v_batch;
  update public.import_batches set status=case when v_batch.error_records=0 then 'completed' when v_batch.imported_records=0 then 'failed' else 'partial' end
  where id=v_batch.id returning * into v_batch;
  insert into public.audit_logs(actor,role,action,entity,new_value)
  values(v_actor,public.current_role(),'Importó archivo Excel','Importación',p_file_name || ' · ' || v_batch.imported_records || ' guardados · ' || v_batch.error_records || ' errores');
  insert into public.sync_sources(source,name,status,enabled,last_sync_at,records_synced,errors)
  values('excel','Excel','connected',true,now(),v_batch.imported_records,v_batch.error_records)
  on conflict(source) do update set last_sync_at=excluded.last_sync_at,records_synced=excluded.records_synced,errors=excluded.errors,status='connected';
  insert into public.sync_history(source,records,duration_seconds,status,error_message)
  values('excel',v_batch.imported_records,extract(epoch from clock_timestamp()-v_start),case when v_batch.status='completed' then 'Success' when v_batch.status='failed' then 'Error' else 'Warning' end,
    case when v_batch.error_records>0 then v_batch.error_records || ' filas no guardadas. Consulta el detalle.' else null end);
  return to_jsonb(v_batch);
end; $$;
revoke all on function public.import_treasury_records(text,text,jsonb) from public, anon;
grant execute on function public.import_treasury_records(text,text,jsonb) to authenticated;

-- Additive upgrade. Apply after import_integrity. Never replay cleanup migrations.
alter table public.bank_accounts add column if not exists ledger_code text;
alter table public.bank_accounts add column if not exists balance_date date;
alter table public.bank_accounts alter column account_number drop not null;
alter table public.investments add column if not exists rate_known boolean not null default true;
alter table public.sync_history add column if not exists import_batch_id uuid references public.import_batches(id);

create or replace function public.import_treasury_records(p_file_name text, p_file_hash text, p_records jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_batch public.import_batches%rowtype;
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
  select * into v_batch from public.import_batches where file_hash = p_file_hash;
  if found then return to_jsonb(v_batch); end if;
  select coalesce(name,email,'Usuario') into v_actor from public.profiles where id = auth.uid();
  insert into public.import_batches(file_name,file_hash,source,uploaded_by,uploaded_by_id,status,total_records)
  values(p_file_name,p_file_hash,'excel',v_actor,auth.uid(),'processing',jsonb_array_length(p_records)) returning * into v_batch;

  for v_rec in select value from jsonb_array_elements(p_records) loop
    n := v_rec->'normalized'; v_kind := v_rec->>'entityType';
    v_status := coalesce(v_rec->>'status','ERROR'); v_warning := coalesce(v_rec->>'warnings','');
    v_entity := null; v_bank := null; v_customer := null; v_key := null;
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
        if exists(select 1 from public.import_records where dedupe_key=v_key and entity_id is not null and status in ('VALID','WARNING')) then
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
            if exists(select 1 from public.invoices where customer_id=v_customer and document=n->>'document') then raise exception 'Ya existe este documento para el cliente. Revisa la factura existente'; end if;
            insert into public.invoices(customer_id,document,issue_date,due_date,amount,currency,status)
            values(v_customer,n->>'document',v_issue,v_due,v_amount,v_currency,v_entity_status) returning id into v_entity;
          when 'cash_flow' then
            v_date := nullif(n->>'date','')::date;
            if v_date is null or v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'Fecha de movimiento inválida'; end if;
            v_entity_status := coalesce(v_entity_status,'conciliado');
            if v_entity_status not in ('conciliado','confirmado','programado','pendiente','proyectado','borrador','pagado','cancelado','vencido') then raise exception 'Estado de movimiento inválido'; end if;
            insert into public.cash_flow(date,type,category,description,amount,currency,bank_id,status,origin)
            values(v_date,v_type,coalesce(nullif(n->>'category',''),case when v_type='expense' then 'supplier' else 'other_income' end),coalesce(nullif(n->>'description',''),'Movimiento importado'),v_amount,v_currency,v_bank,v_entity_status,'excel') returning id into v_entity;
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
            insert into public.projections(date,type,category,description,amount,currency,bank_id,status)
            values(v_date,v_type,coalesce(n->>'category','other_income'),coalesce(nullif(n->>'description',''),'Proyección importada'),v_amount,v_currency,v_bank,v_entity_status) returning id into v_entity;
          when 'investment' then
            v_issue := nullif(n->>'startDate','')::date; v_due := nullif(n->>'endDate','')::date;
            if v_issue is null or v_due is null or v_due < v_issue or v_issue < date '2000-01-01' or v_due > date '2100-12-31' then raise exception 'Fechas de inversión inválidas'; end if;
            v_entity_status := coalesce(v_entity_status,'vigente');
            if v_entity_status not in ('vigente','por_vencer','rescatada','rescate_programado') then raise exception 'Estado de inversión inválido'; end if;
            insert into public.investments(bank_id,type,amount,currency,start_date,end_date,rate,estimated_interest,status,rate_known)
            values(v_bank,coalesce(n->>'investmentType','colocacion'),v_amount,v_currency,v_issue,v_due,coalesce((n->>'rate')::numeric,0),coalesce((n->>'interest')::numeric,0),v_entity_status,coalesce((n->>'rateKnown')::boolean,n->>'rate' is not null)) returning id into v_entity;
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
    imported_records=(select count(*) from public.import_records where import_batch_id=b.id and entity_id is not null)
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
revoke all on function public.import_treasury_records(text,text,jsonb) from public, anon;
grant execute on function public.import_treasury_records(text,text,jsonb) to authenticated;

-- Count only trace records whose financial entity still exists. Legacy counters
-- and seeded Success rows cannot prove that a financial import took place.
create or replace view public.verified_import_records with (security_invoker=true) as
select r.id,r.import_batch_id,r.entity_type,r.entity_id from public.import_records r
where r.status in ('VALID','WARNING') and (
 (r.entity_type='cash_flow' and exists(select 1 from public.cash_flow e where e.id=r.entity_id)) or
 (r.entity_type='invoice' and exists(select 1 from public.invoices e where e.id=r.entity_id)) or
 (r.entity_type='customer' and exists(select 1 from public.customers e where e.id=r.entity_id)) or
 (r.entity_type='investment' and exists(select 1 from public.investments e where e.id=r.entity_id)) or
 (r.entity_type='projection' and exists(select 1 from public.projections e where e.id=r.entity_id)) or
 (r.entity_type='bank_account' and exists(select 1 from public.bank_accounts e where e.id=r.entity_id))
);
grant select on public.verified_import_records to authenticated;

create or replace function public.get_excel_import_status() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
with batches as (
 select b.*, (select count(*) from verified_import_records r where r.import_batch_id=b.id)::int as present
 from import_batches b where b.source='excel' and b.file_hash is not null
), history as (
 select b.id,'excel'::text as source,b.present as records,
   coalesce((select h.duration_seconds from sync_history h where h.import_batch_id=b.id limit 1),0) as duration_seconds,
   case when b.status='failed' then 'Error' when b.present<b.imported_records then 'Warning'
     when b.error_records>0 or b.warning_records>0 then 'Warning' when b.present=0 then 'NoChanges' else 'Success' end as status,
   case when b.present<b.imported_records then 'Parte de los datos de este lote ya no existe en la plataforma.'
     when b.error_records>0 then b.error_records || ' filas no guardadas. Consulta Importaciones.'
     when b.warning_records>0 then b.warning_records || ' filas guardadas con advertencias. Consulta Importaciones.'
     when b.present=0 then 'Sin nuevos registros guardados.' else null end as error_message,
   b.created_at as synced_at,true as verified
 from batches b
 union all
 select h.id,h.source,h.records,h.duration_seconds,'Unverified',
   'Registro histórico sin vínculo verificable con una importación. La cifra declarada no acredita datos guardados.',h.synced_at,false
 from sync_history h where h.import_batch_id is null
), recent as (select * from history order by synced_at desc limit 30)
select jsonb_build_object(
 'records',(select count(distinct (r.entity_type,r.entity_id)) from verified_import_records r join batches b on b.id=r.import_batch_id),
 'last_sync_at',(select max(created_at) from batches where present>0),
 'errors',coalesce((select error_records from batches order by created_at desc limit 1),0),
 'history',coalesce((select jsonb_agg(to_jsonb(recent) order by synced_at desc) from recent),'[]'::jsonb)
);
$$;
revoke all on function public.get_excel_import_status() from public,anon;
grant execute on function public.get_excel_import_status() to authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
