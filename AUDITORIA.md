# Auditoría y mejoras — SONACOL Treasury

Fecha: 13 de septiembre de 2026. Alcance: código fuente del ZIP `sonaco-treasury-main.zip`, compilación, motor de importación, interfaz, cálculos y persistencia comprobada en una base aislada.

**Resultado:** se corrigieron fallas concretas de lectura y guardado de Excel, se agregó revisión antes de importar y se mejoraron permisos, cálculos y presentación. Es una revisión técnica amplia, no una certificación de ausencia total de errores. No se recibió un Excel real que reprodujera el problema del usuario ni se desplegaron cambios en producción.

## Por qué podía fallar Excel

| Falla encontrada | Efecto posible | Corrección implementada |
| --- | --- | --- |
| Los encabezados conservaban espacios y el diccionario esperaba claves compactas | Columnas habituales no reconocidas | Normalización de espacios, acentos y símbolos; más alias y mapeo manual |
| Valores numéricos entre 20.000 y 60.000 se trataban como fechas sin contexto | Montos y documentos alterados | Solo las columnas de fecha pasan por conversión de seriales |
| Lectura basada en texto formateado | Separadores decimales y miles podían cambiar el importe | Valores numéricos nativos y selección del formato para números escritos como texto |
| Descarte de hojas muy cortas | Un encabezado y una fila útil quedaban fuera | Se aceptan libros con una sola fila de datos |
| Validación de montos sin distinguir entidad o lado contable | Clientes rechazados por no tener monto; Debe/Haber con cero rechazados | Reglas por entidad y cero permitido en el lado no utilizado |
| Cargo/Abono y Debe/Haber compartían convenciones | Ingresos y egresos podían invertirse | Convenciones separadas, visibles en el mapeo |
| Fechas sin validación suficiente y errores de fórmulas ocultos | Fechas inexistentes o importes vacíos llegaban al guardado | Validación de calendario, seriales 1900/1904 y aviso de fórmula sin resultado almacenado |
| Resultado del servidor en snake_case tratado como camelCase | Contadores y estado incorrectos en pantalla | Conversión explícita de la respuesta a los tipos de la aplicación |
| Servidor y fallback escribían por caminos distintos | Reintentos podían duplicar o dejar datos parciales | Una única RPC autenticada, con idempotencia y trazabilidad transaccional |
| Asignación de facturas a un cliente arbitrario | Documentos asociados a la persona equivocada | Coincidencia por RUT o nombre y rechazo de ambigüedades |
| Cuenta enmascarada utilizada como identidad y RUT sin K | Colisiones o identificación incorrecta | Cuenta completa en persistencia, máscara solo en presentación y K conservada |
| Fallos de escritura ocultos o lote “completado” sin entidades | Éxito aparente sin datos realmente guardados | Recuento de filas aceptadas y estados completado, parcial o fallido según resultado |

El flujo nuevo es: **seleccionar → analizar → revisar/configurar → confirmar → consultar resultado**. La lectura sucede en un worker y no persiste datos. La confirmación envía registros normalizados y originales por fila; el servidor vuelve a validar las condiciones fundamentales.

## Integridad y permisos

La migración nueva identifica al usuario mediante su sesión, verifica su rol y mantiene las políticas de acceso a tablas. El código anterior de la Edge Function usaba privilegios de servicio y confiaba en datos de actor aportados por el cliente; se incluye un reemplazo retirado que debe desplegarse o eliminarse del servidor, según explica la guía.

Las importaciones se serializan para esta instalación de una empresa. Una huella del contenido y su configuración evita repetir el mismo lote; otra identidad calculada por el servidor detecta filas ya aceptadas en otros archivos. Las filas que fallan revierten sus escrituras relacionadas. Una falla al registrar la trazabilidad revierte la operación completa, en lugar de dejar entidades sin registro de origen.

Un lote puede aceptar filas correctas y conservar errores de otras filas: ese resultado se declara **parcial**. El número importado representa filas aceptadas, que pueden reutilizar una entidad existente; no significa necesariamente que se hayan creado ese número de clientes o cuentas nuevos.

Los perfiles nuevos pasan a `consulta` y se impide que un usuario común eleve su propio rol. No se cambiaron automáticamente los roles que ya existían. Se conserva el modelo de acceso compartido de una sola organización; no se implementó separación entre empresas.

## Cálculos y comportamiento

| Área | Mejora |
| --- | --- |
| Monedas | Consolidación explícita a CLP utilizando tasas almacenadas; originales conservados en la base; falta de tasa visible, sin inventar un valor |
| Proyección de caja | Exclusión de movimientos liquidados, cancelados y borradores que no deben contarse otra vez |
| Agrupación semanal y mensual | Claves que no mezclan períodos distintos y arrastre del saldo inicial |
| Fechas | Cálculos de días con UTC y presentación de fechas sin desplazarlas al día anterior |
| Cartera vencida | Tramos de antigüedad sin solapamientos |
| Lecturas extensas | Paginación por bloques para evitar truncar silenciosamente las primeras 500 o 1.000 filas |
| Rango de dashboard | Rechazo de fechas invertidas o períodos superiores a 366 días |
| Formularios | Espera de la confirmación de guardado, bloqueo de doble envío y conservación del formulario ante error |
| Exportación | Excel nativo `.xlsx`; CSV con protección de celdas que podrían interpretarse como fórmulas |
| Indicadores | Eliminación de variaciones, avisos y sincronizaciones aleatorias que aparentaban datos reales |
| Sesión | Manejo de carga, errores de perfil, confirmación de correo y cierre de sesión; protección ante respuestas antiguas |

## Mejoras visuales

- Navegación lateral por grupos, etiquetas claras y acceso a todos los módulos.
- Menú móvil con panel desplegable y espacio útil ajustado al ancho de pantalla.
- Importaciones con tres pasos, arrastre real, progreso, contadores y mensajes persistentes.
- Vista previa por hoja, configuración de columnas, filtros y descarga de incidencias.
- Tarjetas y tipografía financiera más legibles, espacios consistentes y tablas con navegación accesible.
- Modales que respetan la altura del dispositivo, estados de foco y preferencia de movimiento reducido.
- Impresión que oculta la navegación y controles ajenos al reporte.

Las capturas en `docs/screenshots/` usan datos sintéticos y muestran la interfaz implementada, no un mockup independiente:

| Archivo | Vista |
| --- | --- |
| `importaciones-desktop.png` | Selección e historial en escritorio |
| `vista-previa-desktop.png` | Revisión del Excel antes de confirmar |
| `importaciones-mobile.png` | Importaciones en viewport de 390 × 844 |

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| ESLint | Sin errores; quedan 4 advertencias de Fast Refresh en contextos compartidos |
| TypeScript de aplicación y configuración | Sin errores |
| Pruebas de lógica y PostgreSQL aislado | 52 aprobadas |
| Navegador Chromium, desarrollo | 6 aprobadas |
| Compilación de producción | Correcta |
| Repetición de navegador sobre producción | No completada: el entorno no pudo recuperar el ejecutable de pruebas y el navegador conectado bloqueó el acceso al servidor local |

Las pruebas de lógica incluyen libros reales generados en XLSX, XLSM y XLS, encabezados desplazados, ceros en Debe/Haber, Cargo/Abono, números regionales, fechas inválidas, seriales 1904, fórmulas sin caché, clientes, facturas, duplicados, mapeo manual, monedas y CSV. Los casos SQL verifican persistencia, reintentos, cuentas distintas, reversión ante errores, trazabilidad, RUT con K y restricción de roles.

Las pruebas de navegador verifican el worker real, selección y arrastre del archivo, revisión y confirmación con API interceptada, error de migración ausente, permisos de consulta, navegación móvil y apertura de los módulos principales sin excepciones. Esta evidencia no sustituye una prueba de conectividad, políticas y datos en el Supabase desplegado.

Se corrigieron los scripts de comprobación para que TypeScript revise realmente el código de la aplicación. El build ahora carga páginas bajo demanda y separa React, Supabase, gráficos y Excel; no se obtuvo un benchmark de rendimiento sobre dispositivos reales ni se promete un porcentaje de velocidad.

## Pendientes priorizados

| Prioridad | Trabajo pendiente | Motivo |
| --- | --- | --- |
| Antes de usar la actualización | Aplicar la nueva migración, retirar la Edge Function anterior y publicar el frontend | Los archivos del ZIP por sí solos no actualizan el servidor |
| Antes de importar datos productivos | Validar uno de los Excel concretos que fallaban y comparar un lote conocido | No se recibió una muestra del formato real del usuario |
| Antes de abrir acceso externo | Revisar las altas, roles y restricción del registro público | Las políticas heredadas permiten lectura a usuarios autenticados de la organización compartida |
| Alta | Revisar importaciones históricas fallidas o duplicadas | No se reconstruyen huellas ni se depuran automáticamente datos previos |
| Alta | Definir saldos de apertura, procedimiento de conciliación y fuente de tasas | Importar un movimiento no acredita por sí mismo un saldo bancario correcto |
| Alta | Migrar modificaciones financieras manuales a operaciones con auditoría indivisible | La garantía transaccional agregada corresponde a la importación; otras acciones aún registran auditoría por separado |
| Media | Paginar y agregar datos en el servidor; trabajos en segundo plano para grandes volúmenes | La lectura completa en el navegador y el límite de 20.000 filas no reemplazan una solución de gran escala |
| Media | Tasas históricas por fecha y moneda, con fuente y vigencia | La consolidación actual utiliza las tasas configuradas, no una valoración histórica por transacción |
| Media | Conectores reales de ERP y bancos, con credenciales y conciliación operativa | El proyecto no contiene esas integraciones funcionales |
| Media | Conservar el archivo original en almacenamiento privado y definir retención | Se conserva trazabilidad de filas, no el binario original |
| Media | Generar tipos de Supabase a partir del esquema desplegado | Persisten zonas de servicio con tipos flexibles para las tablas incorporadas |
| Baja | PDF dedicado, traducciones completas y eliminación de advertencias Fast Refresh | El PDF actual utiliza impresión del navegador y la interfaz está centrada en español |

El análisis no incluyó pentesting externo, carga simultánea en producción, exactitud contable de datos históricos, garantía de disponibilidad, una auditoría legal ni verificación de todos los formatos posibles de Excel.

## Dependencia de Excel

Se fijó SheetJS 0.20.3 desde su distribución oficial y se incluyó el tarball en `vendor/` para que la instalación no dependa de descargarlo desde una URL adicional. Referencias del proveedor: [instalación de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) e [integración con aplicaciones](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/).
