# Activar la actualización

Para la corrección actual usa **sonaco-solo-base.zip → LEEME_PRIMERO.md**. La importación carga exclusivamente BASE. Este paquete incluye el código y un SQL acumulativo; reemplaza las instrucciones de los parches anteriores.

Esta guía corresponde al proyecto del ZIP. No se aplicaron cambios al Supabase alojado ni se publicó una nueva versión de tu sitio.

## 1. Actualizar la base existente

Conserva un respaldo de los datos y el código que utilizas actualmente. Abre el **SQL Editor** del proyecto Supabase conectado a la aplicación.

Ejecuta el contenido completo de:

`supabase/migrations/20260914000000000_import_integrity.sql`

La migración requiere las tablas de las versiones `schema_v1` y `data_platform_v2`, presentes en el proyecto original. Añade columnas e índices y actualiza funciones, políticas y protección de roles; no borra registros financieros.

**No vuelvas a ejecutar las migraciones antiguas llamadas `cleanup_demo` o `cleanup_test` sobre datos reales: contienen operaciones de borrado. Tampoco ejecutes un reset de la base para instalar esta corrección.** Se conservan los archivos históricos para mantener el contexto de la instalación.

Para comprobar que existe la nueva operación, ejecuta esta consulta de solo lectura:

```sql
select to_regprocedure('public.import_treasury_records(text,text,jsonb)') as funcion_importacion;
```

El resultado debe identificar la función y no ser `NULL`. Si la API aún informa que falta la función después de aplicar la migración, solicita la recarga de su esquema:

```sql
notify pgrst, 'reload schema';
```

Para una base completamente nueva, prepara primero las estructuras v1 y v2 en un entorno de prueba y revisa sus inserciones de demostración. No se incluye aquí una orden de despliegue masivo porque los archivos históricos mezclan estructura, ejemplos y limpieza.

## 2. Retirar la función de importación anterior

La aplicación nueva usa `import_treasury_records` y ya no llama a la Edge Function `import-excel`.

Si esa función antigua sigue publicada, **elimínala desde la administración de Edge Functions o despliega el reemplazo incluido en `supabase/functions/import-excel/index.ts`**. El reemplazo devuelve HTTP 410 y no escribe en la base. Actualizar solo el frontend no retira el código remoto anterior.

Si tu entorno ya usa Supabase CLI, puedes desplegar el reemplazo con el identificador real de tu proyecto:

```sh
supabase functions deploy import-excel --project-ref TU_PROJECT_REF_REAL
```

Obtén ese identificador en el proyecto conectado. No copies automáticamente el `project_id` histórico de la configuración del ZIP: verifica que corresponda al destino de despliegue. Programa el cambio junto al frontend, porque las versiones antiguas dejarán de importar al retirar esta función.

## 3. Revisar usuarios y conexión

Los roles `administrador` y `tesoreria` pueden importar. `consulta` y `contabilidad` no pueden confirmar importaciones. Los usuarios nuevos reciben `consulta`; sus roles no se promueven automáticamente. Los roles de los usuarios ya existentes se conservan.

Un administrador puede asignar el rol adecuado mediante la administración del proyecto. Comprueba el correo y el ID de la persona antes de cambiar permisos. No se necesita una clave privada en el navegador.

La corrección protege los cambios de rol, pero la aplicación sigue siendo de una sola organización: las políticas originales permiten lectura a usuarios autenticados. Si solo debe entrar personal autorizado, restringe el registro público y gestiona altas por invitación en la configuración de autenticación del proyecto antes de abrir el acceso externo.

Copia `.env.example` a `.env.local` y configura la URL y la clave pública si tu entorno utiliza otro proyecto. La analítica externa queda desactivada salvo activación explícita.

## 4. Compilar y publicar

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Publica `dist/` usando tu alojamiento actual, con HTTPS y fallback de rutas a `index.html`. Actualiza los archivos HTML y sus assets como una misma versión. El navegador requiere contexto seguro para calcular la huella del archivo; `localhost` sirve para desarrollo.

El paquete incluye código fuente, dependencias fijadas mediante el lockfile, pruebas y documentación. No incluye `node_modules` ni una compilación ligada a tus variables de entorno.

## 5. Comprobar con un archivo real

1. El libro real recibido posteriormente ya fue probado en una base aislada. Consulta CORRECCION_EXCEL.md para ver el resultado y las advertencias.
2. Descarga la plantilla o selecciona tu libro. La lectura y la vista previa no escriben datos.
3. Compara visualmente monto, moneda, tipo y fecha con el archivo original. Ajusta cada hoja y pulsa aplicar antes de continuar.
4. Confirma. El lote debe mostrar sus filas efectivamente aceptadas y las rechazadas, con explicación.
5. Abre los módulos correspondientes y verifica los registros. Si repites el mismo archivo con la misma configuración, se recupera el lote existente. Cambiar la configuración genera otra revisión; también se comprueban coincidencias entre filas ya importadas.
6. Si se interrumpe la conexión al confirmar, consulta primero el historial: una respuesta perdida no implica que el servidor haya revertido la operación.

## Reglas del lector

| Situación | Comportamiento |
| --- | --- |
| `.xlsx`, `.xlsm`, `.xls` | Se comprueba formato y contenido; no se ejecutan macros |
| Archivos protegidos o dañados | Deben abrirse y guardarse como un libro válido sin contraseña antes de importar |
| Hoja con una sola fila de datos | Se acepta si tiene encabezados y datos válidos |
| Títulos antes de los encabezados | Detección en las primeras 50 filas con contenido; ajuste manual con el número de fila original |
| `Debe` y `Haber` | Convención del flujo contable: Debe = ingreso, Haber = egreso; se permite cero en el lado no usado |
| `Cargo` y `Abono` | Convención de cartola bancaria: Cargo = egreso, Abono = ingreso |
| Ambas columnas con monto | Se rechaza la fila para evitar una interpretación silenciosa |
| Monto numérico de Excel | Se conserva su valor; no se convierte en fecha por su tamaño |
| Montos guardados como texto | Chile por defecto (`1.234,56`); selecciona EE. UU. para textos como `1,234.56`, especialmente valores ambiguos como `1.234` |
| Fechas | Fechas nativas de Excel, seriales 1900/1904 y texto día/mes/año o ISO; rango 2000–2100. No se adivinan fechas de texto mes/día/año |
| Fórmulas | Se utiliza el resultado guardado por Excel. Si falta o contiene un error, recalcula y guarda el libro antes de subirlo |
| Clientes | No necesitan monto; requieren nombre; el RUT ayuda a identificar coincidencias |
| Facturas | Requieren documento, cliente identificable, monto y fechas válidas; se rechazan coincidencias ambiguas |
| Monedas | CLP, USD, UF y UTM; las desconocidas se marcan como error |
| Hoja desconocida | Se muestra para asignar destino o excluirla |
| Conciliación | No tiene importación automática en esta revisión; se gestiona desde su módulo |
| Tamaño | Hasta 20 MB, 20.000 filas de datos y 2.000.000 de celdas con contenido. Las filas y columnas vacías con formato no cuentan como datos |

La confirmación conserva las filas de trazabilidad y los datos normalizados. No almacena el archivo Excel original en un bucket. Guarda el original en tu repositorio documental si necesitas conservarlo.

Importar movimientos no recalcula automáticamente los saldos contables del banco. Las cuentas nuevas parten con saldo cero: configura el saldo de apertura y concilia antes de utilizarlo como referencia financiera.

## Errores frecuentes

| Mensaje o resultado | Acción |
| --- | --- |
| “Falta actualizar la base de datos” | Aplica la nueva migración en el mismo proyecto de la aplicación y recarga el esquema de API si hace falta |
| “Tu sesión o rol no permite…” | Reingresa y comprueba el rol real del perfil |
| Error de lectura | Abre el archivo en Excel, elimina la contraseña si existe y guarda una copia válida; no basta cambiar la extensión |
| Montos o tipos incorrectos en la vista previa | Ajusta el mapeo y la convención numérica, o corrige el archivo antes de confirmar |
| “Tasa no disponible” | Configura una tasa válida en `fx_rates`; una unidad de moneda equivale a `rate_to_clp` pesos chilenos |
| Archivo muy grande o límite de análisis | Los límites se aplican a datos reales. El formato vacío se ignora automáticamente; si se alcanza un límite real, hace falta ampliar la capacidad de procesamiento |
| “Parcial” | Algunas filas se guardaron y otras requieren revisión; consulta el detalle antes de corregir y volver a importar |
| ERP o banco sin conector | Requiere una integración real; no se generan importaciones ficticias |

Las importaciones antiguas no recibieron retroactivamente huellas de deduplicación. Revisa su historial y sus registros antes de reimportar archivos históricos; no se ejecutó una limpieza automática de esos datos.
