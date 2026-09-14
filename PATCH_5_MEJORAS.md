# Parche de las cinco mejoras

**Estado: comprobaciones locales completadas el 14/09/2026. Listo para revisión y aplicación siguiendo los pasos de esta guía.**

El código está en la rama `codex/base-treasury-five-improvements` y en el [PR de revisión](https://github.com/Ignvco/sonaco-treasury/pull/1). La rama principal conserva la versión que funciona.

## Qué cambia

1. **Caja desde BASE.** Suma de REAL de las partidas BANCO hasta la fecha de corte. La apertura ya forma parte de esas filas y no se suma nuevamente. Se identifica el origen BANCO; no se fija permanentemente el límite en la fila 5765.
2. **Comparación diaria.** Vista previa de filas nuevas, modificadas, sin cambios, ambiguas o con errores. Puedes desmarcar modificaciones. Las actualizaciones conservan el ID y el historial. Si los datos cambian después de la comparación, debes analizar el archivo otra vez.
3. **Proyección de 7, 15 y 30 días.** Parte de la caja e incorpora CLIENTES, COLOCACIONES y las proyecciones MANUAL de BASE. Las proyecciones ingresadas en la plataforma también se incluyen. Los cobros o rescates que una proyección manual representa se vinculan explícitamente para contarlos una sola vez.
4. **Dashboard y bancos.** Indicadores, gráfico central, pendientes, tablas con encabezado fijo, montos alineados y filtros por usuario en este navegador.
5. **Origen de las cifras.** Los indicadores y saldos diarios del dashboard abren su desglose. Cada partida permite consultar la fila original, sus valores y las fórmulas guardadas en BASE.

El importador sigue leyendo exclusivamente BASE. No ejecuta macros ni consulta otras hojas. Tus ingresos en PROYECTADO llegan a la plataforma cuando están reflejados en BASE.

## Cómo interpretar los importes

- «Como en BASE» suma los valores literales de REAL sin convertir monedas. Permite comparar la cifra con Excel.
- «Solo CLP», «Solo USD», etc., filtran por la moneda identificada en la fila. La suma literal de distintas monedas no se presenta como una conversión a pesos.
- Los saldos son contables. No se inventa un saldo confirmado por cartola.
- Los pendientes con fecha anterior al corte se trasladan al primer día de la proyección y quedan marcados para revisar la fecha. Es una hipótesis de proyección, no una confirmación de cobro.
- Una fila que desaparece del próximo libro conserva su historial y aparece como registro fuera de la última BASE. Queda fuera de la caja y la proyección activa, sin marcarla automáticamente como pagada.
- Los reportes anteriores de flujo usan las partidas CLP de BASE e indican esta base de cálculo.
- Las coincidencias ambiguas no se fusionan. Esto conserva partidas contables distintas aunque tengan el mismo importe.
- Si la última importación tiene errores, el dashboard muestra que sus cifras requieren revisión.
- No se modifica el libro Excel.

## 1. Preparar una revisión local en tu Mac

Abre Terminal dentro de la carpeta del proyecto. Comprueba primero que `git status` no muestra cambios tuyos pendientes.

```bash
git status
git switch -c revision-5-mejoras
curl --fail --location 'https://github.com/Ignvco/sonaco-treasury/pull/1.diff' --output /tmp/sonaco-5-mejoras.patch
git apply --check /tmp/sonaco-5-mejoras.patch
git apply /tmp/sonaco-5-mejoras.patch
```

Si `git apply --check` muestra un error, detente y comparte ese mensaje: la versión de tus archivos difiere de la referencia. No se deben forzar los reemplazos.

Este parche parte de la versión «Importa exclusivamente BASE del libro SONACOL», commit `c5d6004fcb62b9e0c4c1396f26b068d0d589919d`.

## 2. Repetir las comprobaciones en tu Mac

Node debe ser 22.13 o posterior; la configuración de pruebas usa Node 24.

```bash
node -v
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 build
npx --yes pnpm@11.19.0 exec playwright install chromium
npx --yes pnpm@11.19.0 test:e2e
```

Las pruebas de base de datos usan PGlite aislado. No escriben en tu Supabase. Las de navegador interceptan la API y usan datos sintéticos.

Para comprobar tu Excel original sin modificarlo, reemplaza la ruta entre comillas y añade la suma esperada como número con punto decimal:

```bash
node --import tsx tests/verify-original-base.mjs "/ruta/a/tu-archivo.xlsm" 14457712.22
```

La comprobación informa solo recuentos y la suma; verifica que los bytes del archivo no cambiaron.

## 3. Actualizar después de superar las pruebas

1. En el SQL Editor del mismo proyecto Supabase que ya utiliza la aplicación, ejecuta únicamente el contenido completo de `ACTUALIZAR_5_MEJORAS.sql`.
2. Este SQL necesita que las correcciones anteriores de BASE ya estén aplicadas. No vuelvas a ejecutar las migraciones históricas de limpieza.
3. Abre la aplicación local:

```bash
npx --yes pnpm@11.19.0 dev
```

4. En Importaciones debe aparecer `BASE-ONLY-20260914-v2`. Carga el mismo libro, revisa la comparación y confirma. Esta carga añade la referencia actualizada de BASE a la trazabilidad.
5. Comprueba la caja con «Como en BASE», el desglose por banco y las proyecciones. Vuelve a cargar el archivo para verificar que se informa «Sin cambios».
6. Una vez comprobado, publica siguiendo el procedimiento que ya utilizas para tu plataforma.

No cambies las variables de conexión del proyecto. El parche no contiene el Excel ni credenciales.

## Verificación realizada y pendiente

- `pnpm check`: 93 pruebas aprobadas, 0 fallidas; TypeScript sin errores. ESLint conserva 6 advertencias que no bloquean la ejecución.
- `pnpm build`: compilación de producción completada.
- `pnpm test:e2e`: 7 pruebas aprobadas en Chromium, incluida la persistencia de filtros y la apertura y cierre del desglose en móvil.
- Se corrigieron dos pruebas: la fecha de PGlite se compara como fecha calendario y el botón del diálogo se busca por su nombre accesible «Cerrar».
- Lectura del libro original: 1.781 registros BASE, 1.720 movimientos BANCO, 0 errores y 7 advertencias. Suma REAL de BANCO: **14.457.712,22**, mostrada sin decimales como **14.457.712**. Se comprobó que los bytes del Excel no cambiaron.
- Importación del libro original en PGlite aislado: 1.781 registros guardados sin errores. Una segunda carga reconoció los 1.781 como «sin cambios», creó 0 registros financieros nuevos y conservó la misma caja.
- Estas verificaciones se completaron localmente, sin depender de GitHub Actions. Las pruebas de navegador usan respuestas de API simuladas; la prueba del libro ejecuta las migraciones y funciones SQL en PGlite.
- Pendiente en tu entorno: aplicar el SQL v6 y revisar la carga de BASE con los datos que ya tienes guardados, siguiendo el apartado 3. No se ha actualizado ninguna base de datos activa ni desplegado la aplicación desde esta revisión.
