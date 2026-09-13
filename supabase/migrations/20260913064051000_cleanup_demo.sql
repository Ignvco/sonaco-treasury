-- ============================================================
-- SONACOL TREASURY — limpieza de datos de demostración
-- Se elimina toda la data demo de negocio. Se conservan:
--  - profiles (cuentas de usuario)
--  - sync_sources (registro de integraciones: ERP / Excel / Bancos)
--  - fx_rates (parámetros de conversión)
--  - schema completo (tablas, RLS, índices)
-- ============================================================

truncate table
  public.import_records,
  public.import_batches,
  public.reconciliations,
  public.bank_accounts,
  public.invoices,
  public.customers,
  public.cash_flow,
  public.investments,
  public.projections,
  public.banks,
  public.audit_logs,
  public.sync_history
cascade;

-- Reinicia las estadísticas de las integraciones (se repoblarán con datos reales)
update public.sync_sources
set records_synced = 0,
    errors = 0,
    last_sync_at = null,
    status = case when source = 'excel' then 'connected' else 'disconnected' end;

-- Reinicia la secuencia de reintento de IDs (no aplica: UUIDs)
-- Reset audit + fx_rates demos? fx_rates son parámetros, se conservan.