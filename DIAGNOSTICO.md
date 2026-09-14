# Corrección del libro CAJA SONACOL

Esta actualización incluye la corrección anterior de áreas vacías y agrega el lector del formato real CAJA SONACOL. Requiere actualizar el código **y** ejecutar la migración `20260914010000000_sonacol_workbook.sql`, después de `20260914000000000_import_integrity.sql`.

El paquete de corrección contiene `ACTUALIZAR_BASE.sql`: combina ambas migraciones en orden, sin ejecutar los archivos históricos de limpieza. Puedes ejecutarlo completo en el SQL Editor del Supabase conectado a tu aplicación. No borra datos financieros.

## Qué cambia

- Lee las tablas BANCO, CLIENTES, COLOCACIONES y PROYEC; toma cuentas y saldos de INVERSIONES y CUADRATURA BANCOS. BASE permite comprobar los estados conciliados.
- Evita recorrer los rangos vacíos y la columna de errores que ocupa más de un millón de filas en MACRO BANCOS. No ejecuta macros ni modifica el Excel.
- No vuelve a importar los reportes, tablas dinámicas ni las copias intermedias como movimientos adicionales. La vista previa explica el uso de cada hoja.
- Conserva movimientos contables iguales que aparecen varias veces en la fuente, sin fusionarlos por monto y fecha. Comprueba duplicados entre importaciones.
- Guarda las cuentas con sus saldos. Si falta un número de cuenta, identifica la cuenta con el código contable y lo indica; no inventa números.
- Protege saldos ya guardados cuando el archivo contiene una fecha anterior o un saldo diferente para la misma fecha.
- Integraciones comprueba los registros contra las entidades guardadas. El historial antiguo sin trazabilidad aparece como «Sin verificar», aunque antes dijera «Success».
- Los movimientos históricos se muestran en su moneda original. Los ya conciliados no se suman otra vez a la proyección de caja.

## Prueba con el libro recibido

Se leyó el `.xlsm` original, sin editarlo, y se ejecutó la función de importación en una base PostgreSQL de prueba aislada mediante PGlite. No se accedió a la base alojada del usuario.

| Datos | Registros guardados |
| --- | ---: |
| Movimientos | 1.720 |
| Facturas | 45 |
| Inversiones | 6 |
| Proyecciones manuales | 10 |
| Cuentas y saldos | 8 |
| Total de registros de importación | 1.789 |

Las facturas crean o relacionan cinco clientes. Los ocho saldos en CLP suman 14.456.115 y coinciden con los movimientos netos de cada cuenta. Un movimiento de apertura en USD conserva su moneda y sus decimales.

La vista previa produce 1.781 filas listas y 8 advertencias, sin errores. Las advertencias corresponden a seis inversiones sin tasa/interés informado, un movimiento en USD y una cuenta cuyo número no figura en el catálogo. La segunda carga del mismo contenido no creó registros adicionales.

El detalle COLOCACIONES contiene 23.354.800.000 CLP, mientras el resumen INVERSIONES muestra 4.535.500.000 CLP en su columna de colocaciones. Son valores distintos del propio libro: esta versión utiliza el detalle, no mezcla ni suma ambos. Revisa esa diferencia antes de confirmar. Los resúmenes dinámicos y las fórmulas se leen con sus resultados guardados; no se recalculan.

Estos conteos corresponden a este archivo y a una base de prueba. Si tu plataforma tiene datos previos, la detección de duplicados o conflictos puede cambiar lo que se guarda. Consulta el resultado de la importación.

## Activación

1. Aplica el parche acumulativo sobre la primera actualización del proyecto entregada en esta conversación. No necesitas aplicar el parche anterior de áreas vacías.
2. Ejecuta `ACTUALIZAR_BASE.sql` en el proyecto Supabase conectado a tu aplicación.
3. Instala dependencias, ejecuta `pnpm check` y `pnpm build`, y publica la versión actualizada en tu alojamiento.
4. Abre Importaciones, selecciona tu libro original, revisa las advertencias y confirma. Leer la vista previa todavía no guarda datos.
5. Revisa Bancos, Flujo de Caja → Movimientos, Cuentas por Cobrar, Inversiones, Proyecciones e Integraciones. La corrección no recupera automáticamente los archivos rechazados anteriormente: debes volver a seleccionarlos y confirmar.

Si una fila falla, el detalle debe explicar por qué no se guardó. Si falta la nueva función de base de datos, la app muestra un error de actualización; no presenta ese fallo como cero registros o éxito.
