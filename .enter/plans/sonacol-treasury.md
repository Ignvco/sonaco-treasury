# SONACOL TREASURY — Plan de Implementación

## Contexto

Se construye un sistema corporativo de Tesorería / Cash Management (escritorio, desktop-first) llamado **SONACOL TREASURY**, como reconstrucción web moderna de la lógica funcional del Excel `CAJA SONACOL v4` (proyección diaria, bancos, inversiones/colocaciones, cuadratura, clientes), **sin** datos reales y sin la fragilidad del Excel.

- **Referencia visual**: imagen adjunta (fondo `#F4F5F7`, cards blancas muy redondeadas, verde `#0D8248`/`#14965F` como acento, sidebar iconos, jerarquía limpia estilo fintech premium).
- **Funcionalidad (del Excel)**: `PROYECTADO DIARIO $` → Flujo de Caja diario/semanal/mensual; `BANCO`/`CUADRATURA BANCOS`/`MACRO BANCOS` → Bancos + Conciliación; `CLIENTES`/`INFORME CTE CTE`/`MACRO CLIENTES` → Cuentas por Cobrar; `INVERSIONES`/`COLOCACIONES`/`INFORME COLOCACIONES` → Inversiones; `PROYEC` → Proyecciones; `PARAMETROS` → Configuración; `INFORMES EN US$` → Reportes en USD.
- **Proyecto actual**: template shadcn/ui (React 19 + Vite 7 + Tailwind 3.4 + TS). Ya instalados: `recharts`, `lucide-react`, `date-fns`, `react-router-dom`, `framer-motion`, `@radix-ui/*` y los componentes `ui/` (card, table, badge, dialog, popover, select, dropdown-menu, tooltip, chart, skeleton, etc.).
- **Sin backend en esta versión**: el brief pide mock/seed data. Todo el MVP es client-side; arquitectura preparada para conectar ERP/SQL Server/API/DB después (services separados). No se habilita Enter Cloud.
- **Idioma de la UI**: español (textos literales en componentes; no se usa i18n).

## Decisiones clave

1. **Solo tema claro** (el brief prohíbe interfaces oscuras). El token `.dark` queda sin uso visual.
2. **Design system**: reescribir tokens en `src/index.css` y radius en `tailwind.config.ts`; tipografía **Inter** vía Google Fonts en `index.html` (fallback system-ui), sin dependencias nuevas.
3. **Moneda**: contexto ligero `CurrencyProvider` (CLP por defecto; selector CLP/USD/UF/UTM en header y en páginas). Sin conversión real. Formateo con `Intl.NumberFormat`.
4. **KPI del dashboard derivados del seed data** vía `financial-engine` (consistentes entre sí: liquidez = caja + inversiones líquidas − obligaciones), no números hardcodeados.
5. **Enmascaramiento**: cuentas `**** **** 2493` y RUT enmascarado por defecto (con opción de revelar en detalle).
6. **Exportar demo**: "Exportar Excel" genera CSV (compatible Excel, sin librería nueva) y "Exportar PDF" usa `window.print()` con vista de impresión. Marcados como demo.
7. **Estado de cada pantalla**: componentes Loading / Empty / Error / Success / NoResults compartidos; el seed data se "carga" con un pequeño retraso simulado para demostrar los estados.
8. **Router**: todas las páginas bajo `AppLayout` (sidebar compacta + header), ruta `/` redirige a `/dashboard`.

## Arquitectura de archivos

```
src/
  index.css                     → NUEVOS tokens de diseño
  tailwind.config.ts            → radius + colores mapeados a tokens
  index.html                    → Google Fonts Inter
  router.tsx                    → rutas bajo AppLayout
  layouts/
    AppLayout.tsx               → shell: sidebar + header + <Outlet/>
    Sidebar.tsx                 → 68px, iconos lucide, tooltips, estado activo verde
    TopHeader.tsx               → título de sección, selector de período (DateRangePicker), notificaciones, avatar, moneda
  components/treasury/
    KpiCard.tsx                 → título chico / valor grande / badge variación / subtexto
    SectionCard.tsx             → shell de card (border 1px, radius 20px, shadow suave)
    ChartCard.tsx               → card con título + selector de período + gráfico
    StatusBadge.tsx             → badges (success/warning/danger/info/muted) pill
    BankCard.tsx                → card de banco: contable/conciliado/proyectado/diferencia/estado
    DataTable.tsx               → tabla premium: sticky header, hover, sort, filtro, búsqueda, paginación, badge, menú acciones
    DateRangePicker.tsx         → popover calendario (react-day-picker ya instalado)
    CurrencySelector.tsx        → select CLP/USD/UF/UTM
    FilterBar.tsx               → filtros reutilizables (desde/hasta/banco/categoría/estado/buscar)
    PageHeader.tsx              → título + subtítulo + acciones derecha
    EmptyState / LoadingState / ErrorState / NoResults.tsx
    MaskedText.tsx              → enmascara cuentas/RUT
    ExportMenu.tsx              → dropdown Exportar (CSV / PDF demo)
    NotificationPopover.tsx     → campana con lista demo
  financial-engine/
    types.ts                    → Bank, BankAccount, Customer, Invoice, CashFlow, Investment, Payment, Projection, Reconciliation, AuditLog, Enums
    format.ts                   → money, fecha, porcentaje, enmascarado, CLP/USD/UF
    validate.ts                 → fechas válidas, montos>0, campos obligatorios, estados controlados (sin NaN/null/1900/#N/D en UI)
    calculations.ts             → saldoDiario/semanal/mensual, ingresos, egresos, liquidezNeta, gap, cobrosEsperados, pagosEsperados, vencimientos, agingCartera, posición por banco, próximaDéficit
  services/
    dataService.ts              → API de datos (getBanks(), getCashFlow(), ...) con delay simulado; hoy retorna seed, mañana apunta al backend
  data/
    seed.ts                     → TODOS los datos ficticios (bancos, clientes A/B/C, proveedores, movimientos, inversiones, proyecciones, conciliaciones)
    audit.ts                    → registro demo de auditoría (usuario, acción, fecha, entidad, antes/después)
  pages/
    Dashboard.tsx  CashFlow.tsx  Banks.tsx  Reconciliation.tsx
    Receivables.tsx  Payments.tsx  Investments.tsx  Projections.tsx  Reports.tsx  Settings.tsx
```

## Design System (tokens)

`src/index.css` — sobreescribir `:root` (light only):

- `--background: 0 0% 96%` (#F4F4F6) · `--card: 0 0% 100%`
- `--primary: 158 74% 33%` (#14965F) · `--primary-foreground: 0 0% 100%`
- verde oscuro `--brand-dark: #087A4B` (variante hover/gradient suave)
- `--foreground: 0 0% 9%` (#171717) · `--muted-foreground: 0 0% 45%` (#737373)
- `--border: 0 0% 91%` (#E8E8E8) · `--input` igual
- Semánticos: `--success` verde, `--warning` amarillo suave, `--danger` rojo suave, `--info` azul muy suave
- `--radius: 1rem` (cards grandes usan clases `rounded-[20px]`)
- Shadow suave: `--shadow-card: 0 4px 20px rgba(0,0,0,0.04)` + variante hover `0 8px 30px rgba(0,0,0,0.06)`
- Tipografía: `font-family: "Inter", -apple-system, ...` en body

`tailwind.config.ts`: mapear `success/warning/danger/info` como colores, subir radius base, agregar `font-sans`.

## Páginas (spec funcional)

1. **Dashboard** `/dashboard` — saludo "Buenos días, Equipo de Tesorería" + período + Exportar. 5 KPI cards (Caja Disponible, Caja Proyectada, Cobros Esperados, Pagos Esperados, Liquidez Neta). Gráfico "Flujo de Caja" (barras Ingresos/Egresos + línea Saldo; toggle Diario/Semanal/Mensual). Columna derecha: "Posición Bancaria" (barras proporcionales + "Ver todos los bancos →") y card "Próximo déficit de caja" (fecha, monto, CTA "Revisar flujo"). Inferior: "Historial de Movimientos" (tabla premium con filtros) + "Cuentas por Cobrar" (total + vencido/por vencer/próximo) + "Próximos Pagos" (tabla compacta proveedor/vencimiento/monto/estado).
2. **Flujo de Caja** `/cashflow` — KPIs resumen, gráfico superior (Ingresos/Egresos/Saldo), tabla Fecha | Saldo inicial | Ingresos | Egresos | Saldo proyectado | Variación, vista diaria/semanal/mensual, filtros (desde/hasta/banco/categoría/estado), categorías de ingresos (Recaudación Clientes, Rescate Inversiones, Ingresos varios, Abonos bancarios) y egresos (Proveedores, Remuneraciones, Impuestos, Dividendos, Créditos, Leyes sociales). Botón "+ Registrar movimiento" (modal).
3. **Bancos** `/banks` — grid de `BankCard` (contable / conciliado / proyectado / diferencia / estado OK o Revisar), resumen consolidado, cuentas enmascaradas.
4. **Conciliación** `/reconciliation` — tabla Banco | Cuenta | Saldo contable | Saldo bancario | Diferencia | Última conciliación | Estado + búsqueda/filtro/orden + drawer de detalle (movs contables vs bancarios, diferencias).
5. **Cuentas por Cobrar** `/receivables` — resumen (Total por cobrar, Vencido, Por vencer, Vence esta semana), gráfico aging 0-30/31-60/61-90/90+, tabla Cliente | Documento | Emisión | Vencimiento | Monto | Días vencidos | Estado (Por vencer / Vence pronto / Vencido / Pagado).
6. **Pagos** `/payments` — resumen + tabla Proveedor | Vencimiento | Monto | Categoría | Estado (Programado/Pendiente/Pagado) + registro de pago (modal).
7. **Inversiones** `/investments` — cards superiores (Total invertido, Por vencer, Intereses estimados, Liquidez disponible), timeline de vencimientos, tabla (Tipo FM/Colocación, Monto, Inicio, Término, Días restantes, Tasa, Interés, Banco, Estado Vigente/Por vencer/Rescate programado/Rescatada) + acciones Ver detalle / Programar rescate / Editar / Marcar rescatada (modal).
8. **Proyecciones** `/projections` — formulario (Fecha, Tipo ingreso/egreso, Categoría, Descripción, Monto, Banco, Estado Borrador/Proyectado/Confirmado/Cancelado), tabla con estados + edición; refleja en flujo proyectado.
9. **Reportes** `/reports` — cards: Flujo de Caja, Posición Bancaria, Cuentas por Cobrar, Inversiones, Liquidez, Conciliación; cada uno con Ver / Filtrar / Exportar Excel / Exportar PDF (demo CSV + print).
10. **Configuración** `/settings` — parámetros (empresas, tipos de documento, categorías), máscara de RUT/cuentas (toggle), roles futuros (Admin/Tesorería/Contabilidad/Consulta, solo visual), registro de auditoría (tabla demo), selector de moneda y datos de demo.

## Motor financiero (business logic separada de UI)

- `calculations.ts`: `projectCashFlow(fechaDesde, fechaHasta, filtros)` aplicando **Saldo proyectado = saldo inicial + ingresos − egresos**; agregación diaria/semanal/mensual; `liquidity = caja + inversiones líquidas − obligaciones`; `gapDaily()`; `nextDeficit()`; `aging(invoices)`; `bankPosition()`; `expectedIncome()/expectedPayments()`; `investmentSchedule()`.
- `validate.ts`: helpers que garantizan que la UI nunca muestre `#N/D`, `1900`, `undefined`, `NaN`, `null` (formateo con fallbacks).

## Verificación

- `pnpm run lint` y `pnpm exec tsc --noEmit` sin errores.
- `pnpm run build` OK.
- `website_screenshot` en `http://localhost:3000/dashboard` a **1440×900** (custom) y desktop_1280; verificar flujo completo de navegación (10 páginas) y estado activo del sidebar.
- A **768px**: sidebar colapsada y layout legible (navegación funciona).
- Comprobaciones por página: KPIs consistentes (liquidez = caja + inversiones − obligaciones), toggles diario/semanal/mensual del gráfico, filtros y búsqueda funcionando, paginación, modales (registrar movimiento/pago/rescate/proyección), export CSV descargable, estados Loading/Empty/Error visibles.
- Enmascarado: cuentas `**** **** 2493`, RUT enmascarado; ningún dato real del Excel en pantalla.

## Checklist de implementación

- [ ] Actualizar `index.css` con tokens del design system y `tailwind.config.ts` (radius/colores/fuente)
- [ ] Agregar Google Fonts Inter en `index.html`
- [ ] Crear `financial-engine/types.ts`, `format.ts`, `validate.ts`, `calculations.ts`
- [ ] Crear `data/seed.ts` (datos ficticios) y `services/dataService.ts` (delay simulado)
- [ ] Crear componentes `treasury/` (SectionCard, KpiCard, ChartCard, StatusBadge, DataTable, BankCard, DateRangePicker, CurrencySelector, FilterBar, PageHeader, estados, MaskedText, ExportMenu)
- [ ] Crear `layouts/` (AppLayout, Sidebar 68px, TopHeader) y actualizar `router.tsx` con las 10 rutas
- [ ] Página Dashboard (KPIs, gráfico flujo con toggle, posición bancaria, déficit, historial, cobranzas, pagos)
- [ ] Página Flujo de Caja (gráfico + tabla proyectada + filtros + registrar movimiento)
- [ ] Página Bancos (cards por banco + consolidado)
- [ ] Página Conciliación (tabla + detalle en drawer)
- [ ] Página Cuentas por Cobrar (resumen + aging + tabla)
- [ ] Página Pagos (tabla + registrar pago)
- [ ] Página Inversiones (resumen + timeline + tabla + rescate)
- [ ] Página Proyecciones (formulario + tabla con estados)
- [ ] Página Reportes (cards + export Excel/PDF demo)
- [ ] Página Configuración (parámetros, auditoría, roles, máscaras)
- [ ] Lint + typecheck + build sin errores
- [ ] Verificación visual por screenshot (1440×900, 1280, 768)
