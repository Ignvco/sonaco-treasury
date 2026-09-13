-- ============================================================
-- SONACOL TREASURY — schema v1 (persistence + roles + audit + fx)
-- ============================================================

-- ------------------------------------------------------------
-- PROFILES (created first: current_role() depends on it)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'tesoreria',
  name text,
  created_at timestamptz not null default now()
);

-- Current user role helper (security definer avoids recursive RLS)
create or replace function public.current_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.current_role() = 'administrador');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, name)
  values (
    new.id,
    new.email,
    'tesoreria',
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'usuario'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- BANKS
-- ------------------------------------------------------------
create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'activo',
  created_at timestamptz not null default now()
);
alter table public.banks enable row level security;
create policy "banks_select" on public.banks for select to authenticated using (true);
create policy "banks_insert" on public.banks for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "banks_update" on public.banks for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "banks_delete" on public.banks for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- BANK ACCOUNTS
-- ------------------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id) on delete cascade,
  account_number text not null,
  currency text not null default 'CLP',
  status text not null default 'activo',
  balance numeric not null default 0,
  reconciled_balance numeric not null default 0,
  last_reconciliation date,
  created_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy "bank_accounts_select" on public.bank_accounts for select to authenticated using (true);
create policy "bank_accounts_insert" on public.bank_accounts for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "bank_accounts_update" on public.bank_accounts for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "bank_accounts_delete" on public.bank_accounts for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- CUSTOMERS
-- ------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  rut text,
  name text not null,
  type text,
  status text not null default 'activo',
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create policy "customers_select" on public.customers for select to authenticated using (true);
create policy "customers_insert" on public.customers for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "customers_update" on public.customers for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "customers_delete" on public.customers for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- INVOICES
-- ------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  document text not null,
  issue_date date not null,
  due_date date not null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'CLP',
  status text not null default 'por_vencer',
  created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create policy "invoices_select" on public.invoices for select to authenticated using (true);
create policy "invoices_insert" on public.invoices for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "invoices_update" on public.invoices for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "invoices_delete" on public.invoices for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));
create index if not exists idx_invoices_due on public.invoices (due_date);
create index if not exists idx_invoices_customer on public.invoices (customer_id);

-- ------------------------------------------------------------
-- CASH FLOW
-- ------------------------------------------------------------
create table if not exists public.cash_flow (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('income','expense')),
  category text not null,
  description text not null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'CLP',
  bank_id uuid references public.banks(id) on delete set null,
  status text not null default 'proyectado',
  created_at timestamptz not null default now()
);
alter table public.cash_flow enable row level security;
create policy "cash_flow_select" on public.cash_flow for select to authenticated using (true);
create policy "cash_flow_insert" on public.cash_flow for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "cash_flow_update" on public.cash_flow for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "cash_flow_delete" on public.cash_flow for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));
create index if not exists idx_cash_flow_date on public.cash_flow (date);
create index if not exists idx_cash_flow_bank on public.cash_flow (bank_id);

-- ------------------------------------------------------------
-- INVESTMENTS
-- ------------------------------------------------------------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid references public.banks(id) on delete set null,
  type text not null check (type in ('fondo_mutuo','colocacion')),
  amount numeric not null check (amount >= 0),
  currency text not null default 'CLP',
  start_date date not null,
  end_date date not null,
  rate numeric not null default 0,
  estimated_interest numeric not null default 0,
  status text not null default 'vigente',
  created_at timestamptz not null default now()
);
alter table public.investments enable row level security;
create policy "investments_select" on public.investments for select to authenticated using (true);
create policy "investments_insert" on public.investments for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "investments_update" on public.investments for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "investments_delete" on public.investments for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));
create index if not exists idx_investments_end on public.investments (end_date);

-- ------------------------------------------------------------
-- PROJECTIONS
-- ------------------------------------------------------------
create table if not exists public.projections (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('income','expense')),
  category text not null,
  description text not null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'CLP',
  status text not null default 'proyectado',
  bank_id uuid references public.banks(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.projections enable row level security;
create policy "projections_select" on public.projections for select to authenticated using (true);
create policy "projections_insert" on public.projections for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "projections_update" on public.projections for update to authenticated using (public.current_role() in ('administrador','tesoreria'));
create policy "projections_delete" on public.projections for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));
create index if not exists idx_projections_date on public.projections (date);

-- ------------------------------------------------------------
-- RECONCILIATIONS
-- ------------------------------------------------------------
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  accounting_balance numeric not null default 0,
  bank_balance numeric not null default 0,
  difference numeric not null default 0,
  status text not null default 'activo',
  reconciled_at date,
  created_at timestamptz not null default now()
);
alter table public.reconciliations enable row level security;
create policy "reconciliations_select" on public.reconciliations for select to authenticated using (true);
create policy "reconciliations_insert" on public.reconciliations for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "reconciliations_update" on public.reconciliations for update to authenticated using (public.current_role() in ('administrador','tesoreria','contabilidad'));
create policy "reconciliations_delete" on public.reconciliations for delete to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- AUDIT LOGS (append-only)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'sistema',
  role text,
  action text not null,
  entity text,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "audit_select" on public.audit_logs for select to authenticated using (true);
create policy "audit_insert" on public.audit_logs for insert to authenticated with check (true);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- ------------------------------------------------------------
-- FX RATES (CLP base)
-- ------------------------------------------------------------
create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null unique check (currency in ('CLP','USD','UF','UTM')),
  rate_to_clp numeric not null check (rate_to_clp > 0),
  updated_at timestamptz not null default now()
);
alter table public.fx_rates enable row level security;
create policy "fx_rates_select" on public.fx_rates for select to authenticated using (true);
create policy "fx_rates_insert" on public.fx_rates for insert to authenticated with check (public.current_role() in ('administrador','tesoreria'));
create policy "fx_rates_update" on public.fx_rates for update to authenticated using (public.current_role() in ('administrador','tesoreria'));

-- ------------------------------------------------------------
-- REAL TIME (cash flow, investments)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.cash_flow;
alter publication supabase_realtime add table public.investments;