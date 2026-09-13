-- ============================================================
-- SONACOL TREASURY — data platform schema v2
-- Import batches, import records (trazabilidad), integrations,
-- sync history + real/projected origin on cash flow.
-- ============================================================

-- ------------------------------------------------------------
-- IMPORT BATCHES
-- ------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null default 'excel',
  uploaded_by text,
  status text not null default 'processing',
  total_records int not null default 0,
  valid_records int not null default 0,
  warning_records int not null default 0,
  error_records int not null default 0,
  duplicate_records int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.import_batches enable row level security;
create policy "import_batches_select" on public.import_batches for select to authenticated using (true);
create policy "import_batches_insert" on public.import_batches for insert to authenticated with check (true);

-- ------------------------------------------------------------
-- IMPORT RECORDS (trazabilidad: de dónde salió cada dato)
-- ------------------------------------------------------------
create table if not exists public.import_records (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_sheet text,
  source_row int,
  status text not null check (status in ('VALID','WARNING','ERROR','DUPLICATE')),
  entity_type text,
  entity_id uuid,
  raw_json jsonb,
  normalized_json jsonb,
  warnings text,
  created_at timestamptz not null default now()
);
alter table public.import_records enable row level security;
create policy "import_records_select" on public.import_records for select to authenticated using (true);
create policy "import_records_insert" on public.import_records for insert to authenticated with check (true);
create index if not exists idx_import_records_batch on public.import_records (import_batch_id);

-- ------------------------------------------------------------
-- SYNC SOURCES (integraciones: ERP / Excel / Bancos)
-- ------------------------------------------------------------
create table if not exists public.sync_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null unique,
  name text not null,
  status text not null default 'disconnected',
  last_sync_at timestamptz,
  records_synced int not null default 0,
  errors int not null default 0,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.sync_sources enable row level security;
create policy "sync_sources_select" on public.sync_sources for select to authenticated using (true);
create policy "sync_sources_insert" on public.sync_sources for insert to authenticated with check (true);
create policy "sync_sources_update" on public.sync_sources for update to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- SYNC HISTORY
-- ------------------------------------------------------------
create table if not exists public.sync_history (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  records int not null default 0,
  duration_seconds numeric not null default 0,
  status text not null check (status in ('Connected','Syncing','Success','Warning','Error')),
  error_message text,
  synced_at timestamptz not null default now()
);
alter table public.sync_history enable row level security;
create policy "sync_history_select" on public.sync_history for select to authenticated using (true);
create policy "sync_history_insert" on public.sync_history for insert to authenticated with check (true);
create index if not exists idx_sync_history_synced on public.sync_history (synced_at desc);

-- ------------------------------------------------------------
-- CASH FLOW: origen real vs proyectado + trazabilidad
-- ------------------------------------------------------------
alter table public.cash_flow add column if not exists origin text not null default 'manual';
alter table public.cash_flow add column if not exists import_record_id uuid references public.import_records(id) on delete set null;

-- ------------------------------------------------------------
-- SEED: integration registry + demo sync history
-- ------------------------------------------------------------
insert into public.sync_sources (source, name, status, enabled, records_synced, errors) values
  ('erp', 'ERP Corporativo', 'disconnected', false, 0, 0),
  ('excel', 'Excel histórico', 'connected', true, 52, 0),
  ('banks', 'Integración bancaria', 'disconnected', false, 0, 0)
on conflict (source) do nothing;

insert into public.sync_history (source, records, duration_seconds, status, error_message, synced_at) values
  ('excel', 52, 14, 'Success', null, now() - interval '3 days'),
  ('excel', 38, 11, 'Success', null, now() - interval '1 day'),
  ('erp', 0, 2, 'Error', 'ERP sin configurar: credenciales pendientes', now() - interval '6 hours');