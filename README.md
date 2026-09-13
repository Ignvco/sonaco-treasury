# SONACOL Treasury

Aplicación de tesorería en español con React, TypeScript, Vite y Supabase. Incluye flujo de caja, bancos, cuentas por cobrar, pagos, inversiones, proyecciones, conciliación, reportes e importación de Excel.

Esta revisión corrige la lectura de Excel, incorpora una vista previa editable y reemplaza el guardado anterior por una operación autenticada en PostgreSQL. También mejora la navegación, el uso móvil y varios cálculos financieros.

**Para actualizar una instalación existente, empieza por [ACTUALIZACION.md](ACTUALIZACION.md). El frontend necesita la nueva migración SQL para confirmar importaciones.** El código se verificó localmente; no se modificó la base de datos alojada del proyecto.

## Ejecutar

Requisitos: Node.js 22.12 o superior y pnpm 11.19.0. Se utilizó Node.js 24.19.0 en la verificación.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Si quedan vacíos, se conserva la conexión pública original incluida en el proyecto. Nunca coloques una clave `service_role` en variables `VITE_*`.

La aplicación abre en `http://localhost:8080`. Para compilar y revisar la versión de producción:

```sh
pnpm build
pnpm preview
```

Publica el contenido de `dist/` en el proveedor que ya utilizas. Configura HTTPS y redirección de rutas de la aplicación a `index.html`. Conserva accesibles los archivos de `assets/`, incluido el worker de Excel.

## Verificar

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

Para ejecutar las mismas pruebas de navegador sobre la compilación de producción, en macOS/Linux:

```sh
pnpm build
TEST_PREVIEW=1 pnpm test:e2e
```

En PowerShell, establece `$env:TEST_PREVIEW="1"` antes de `pnpm test:e2e`.

Las pruebas usan libros Excel generados, una base PostgreSQL aislada mediante PGlite y respuestas de API interceptadas. No escriben registros en el Supabase original. Ejecútalas con las variables de conexión originales o sin sobrescribirlas: las pruebas de navegador interceptan ese host concreto.

## Importar Excel

1. Abre **Importaciones** con un rol de Tesorería o Administrador.
2. Selecciona o arrastra un archivo `.xlsx`, `.xlsm` o `.xls` de hasta 20 MB.
3. Revisa las hojas, los montos, las fechas y las advertencias. En la configuración de cada hoja puedes ajustar el encabezado, el destino, las columnas y el formato numérico.
4. Aplica los cambios de configuración. Corrige las filas erróneas en el archivo o acepta explícitamente la revisión para guardar las filas admitidas.
5. Confirma la importación y consulta el resultado y la trazabilidad del lote.

El botón **Plantilla Excel** descarga un `.xlsx` con encabezados compatibles. La fila de ejemplo debe reemplazarse por tus datos. El límite operativo es de 20.000 filas por archivo; los libros grandes deben dividirse.

## Documentación

- [ACTUALIZACION.md](ACTUALIZACION.md): activación en Supabase, despliegue y resolución de errores.
- [AUDITORIA.md](AUDITORIA.md): fallas encontradas, cambios, evidencia y límites pendientes.
- [docs/screenshots](docs/screenshots): capturas de escritorio y móvil con datos sintéticos.
- [CodeGuideline.md](CodeGuideline.md): organización del código.

## Estructura relevante

| Ubicación | Responsabilidad |
| --- | --- |
| `src/import-engine/` | Lectura, detección, normalización y validación de Excel |
| `src/workers/xlsx.worker.ts` | Procesamiento fuera del hilo de la interfaz |
| `src/pages/importations/ImportPreview.tsx` | Revisión y mapeo de hojas |
| `src/services/importService.ts` | Análisis del archivo y confirmación mediante RPC |
| `supabase/migrations/20260914000000000_import_integrity.sql` | Persistencia transaccional y protección de roles |
| `src/financial-engine/` | Cálculos y formatos financieros |
| `tests/` | Pruebas de importación, cálculos, permisos y navegador |
| `vendor/xlsx-0.20.3.tgz` | Distribución fijada de SheetJS, instalada desde el archivo local |

La integración bancaria y ERP necesita un conector real. La pantalla informa esta situación y no simula sincronizaciones exitosas.
