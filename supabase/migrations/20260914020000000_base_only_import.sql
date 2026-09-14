-- Apply after sonacol_workbook. This upgrade preserves existing financial data.
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
        -- BASE references a source row in its cached formula metadata. Bridge
        -- records created by the preceding importer without reopening that sheet
        -- or inserting a second financial entity. Require matching business data.
        v_existing := 0;
        if n->>'sourceProfile' like 'BASE-ONLY-%' and nullif(n->>'legacyRow','') is not null then
          select count(distinct r.entity_id) into v_existing
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
        if v_existing=1 or exists(select 1 from public.import_records where dedupe_key=v_key and entity_id is not null and status in ('VALID','WARNING')) then
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


notify pgrst, 'reload schema';
