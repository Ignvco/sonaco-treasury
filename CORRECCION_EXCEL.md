# Importación exclusiva de BASE

Esta versión sustituye el lector anterior. La aplicación busca una única hoja llamada **BASE** y carga solamente esa hoja. Si BASE no existe, informa el problema y no intenta importar otras hojas.

No carga MACRO BANCO, MACRO BANCOS, MACRO CLIENTES, PARAMETROS, BANCO, CLIENTES, COLOCACIONES, PROYEC, INVERSIONES ni CUADRATURA BANCOS. Los textos BANCO, CLIENTES, COLOCACIONES y MANUAL que aparecen en la columna **TABLA ORIGEN de BASE** se usan para clasificar cada fila; no son órdenes de abrir esas hojas.

Las fórmulas se leen con el resultado que ya está guardado en BASE. No se ejecutan macros, no se siguen referencias y no se recalcula ni modifica el archivo.

## Qué importa

| TABLA ORIGEN en BASE | Destino |
| --- | --- |
| BANCO | Movimientos de caja |
| CLIENTES | Facturas y clientes relacionados |
| COLOCACIONES | Inversiones |
| MANUAL / PROYEC | Proyecciones |

- Conserva el número de fila original y todas las columnas de BASE en la trazabilidad.
- Usa FECHA para los movimientos y la emisión/inicio. Conserva VCTO REAL como vencimiento del documento; VCTO y AJ VCTO también quedan en el detalle. Para proyecciones manuales prioriza AJ VCTO, luego VCTO y finalmente FECHA.
- Usa REAL y verifica que coincida con DEBE menos HABER cuando ambos importes están disponibles.
- Omite las filas de plantilla sin operación financiera. Los errores en campos financieros o fórmulas sin resultado se muestran como filas rechazadas.
- Mantiene la moneda USD cuando está identificada en la descripción de cuenta de BASE. El resto del formato de caja se interpreta en CLP; una columna explícita MONEDA, si existe, tiene prioridad.
- No interpreta CTA CTE (columna AE) como número bancario: en este archivo contiene la línea del comprobante. No crea saldos puntuales a partir de las hojas de resumen. Los saldos y números bancarios previamente registrados se conservan.
- Evita duplicar las filas repetidas entre cargas. La nueva función también reconoce registros verificables guardados por el lector anterior, usando su referencia de origen y datos financieros coincidentes.

## Resultado con el archivo original

Solo BASE: **1.781 registros**, de los cuales **1.774 están listos y 7 tienen advertencias**, sin errores ni duplicados dentro del archivo.

| Registros en BASE | Cantidad |
| --- | ---: |
| Movimientos | 1.720 |
| Facturas | 45 |
| Inversiones | 6 |
| Proyecciones | 10 |

Las facturas se relacionan con cinco clientes. Las siete advertencias corresponden a seis inversiones sin tasa/interés informado y un movimiento en USD. El neto de los movimientos en CLP es 14.456.115; es un total calculado de movimientos, no un saldo bancario leído desde otra hoja.

La prueba se ejecutó con el Excel original y una base PostgreSQL aislada mediante PGlite: se guardaron 1.781 registros y el segundo archivo con el mismo contenido agregó cero. También se probó que la actualización reconoce los registros guardados por la versión anterior, sin volver a crearlos.

Los conteos pueden cambiar si tu base ya tiene datos, conflictos o duplicados.

## Cómo comprobar la versión publicada

Importaciones debe mostrar **«Carga exclusiva de la hoja BASE · BASE-ONLY-20260914-v1»**. La vista previa debe listar solamente BASE.

Si todavía muestra otras hojas o el mensaje antiguo del área de lectura, comprueba que publicaste la nueva compilación y recarga la página con Cmd+Shift+R en Mac.

El paquete `sonaco-solo-base.zip` incluye `LEEME_PRIMERO.md`, un instalador para los archivos de código y `ACTUALIZAR_BASE.sql`. La instalación no requiere aplicar los parches anteriores uno por uno.
