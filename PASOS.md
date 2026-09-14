# Cómo aplicar esta corrección

Este paquete reemplaza el parche anterior de Excel. Ya incluye la corrección del área de lectura, el lector del libro CAJA SONACOL y el historial verificado. No necesitas modificar tu Excel.

Se aplica sobre la primera versión mejorada del proyecto que te entregué. Tu plataforma alojada todavía no tiene estos cambios: hay que actualizar código, base de datos y publicación.

## 1. Aplicar el código

Descomprime el ZIP. Copia `CORRECCION_EXCEL.patch` a la carpeta de tu proyecto, donde está `package.json`.

Abre esa carpeta en VS Code y entra a **Terminal → Nueva terminal**. Ejecuta cada comando por separado:

```sh
git status
```

Si aparecen cambios tuyos pendientes, guárdalos en un commit antes de aplicar el parche para mantenerlos separados.

```sh
git apply --check CORRECCION_EXCEL.patch
```

Si no aparece ningún error, aplica el cambio:

```sh
git apply CORRECCION_EXCEL.patch
```

Si dice «patch does not apply», no fuerces la aplicación: la versión de tus archivos es diferente. Conserva el mensaje exacto para identificar qué archivo no coincide.

## 2. Actualizar Supabase

Entra al proyecto Supabase conectado a tu app y abre **SQL Editor → New query**.

1. Abre el archivo `ACTUALIZAR_BASE.sql` incluido en el ZIP.
2. Copia **todo** su contenido y pégalo en el editor.
3. Pulsa **Run**. Debe finalizar sin errores.

Este archivo aplica únicamente las dos migraciones necesarias, en orden. Sirve también si ya habías aplicado la primera. Añade columnas y funciones; no borra los datos financieros.

No ejecutes los archivos antiguos `cleanup_demo`, `cleanup_test`, ni un reset de la base. No necesitas ejecutar todas las migraciones del repositorio.

Puedes comprobar las funciones con esta consulta:

```sql
select
  to_regprocedure('public.import_treasury_records(text,text,jsonb)') as importador,
  to_regprocedure('public.get_excel_import_status()') as verificador;
```

Ambas columnas deben contener el nombre de su función, no NULL.

## 3. Instalar y comprobar

Usa Node.js 24, o como mínimo 22.13. Comprueba tu versión:

```sh
node --version
```

En la terminal del proyecto:

```sh
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 build
```

`check` ejecuta la revisión del código y las pruebas. Se verificaron 69 pruebas; pueden aparecer cuatro advertencias de Fast Refresh que no impiden compilar.

Para probarlo en tu computador, conserva las variables de conexión de tu proyecto y ejecuta:

```sh
npx --yes pnpm@11.19.0 dev
```

Abre la dirección que muestre la terminal. Esa app local usará el Supabase configurado: confirmar una importación allí sí escribe en esa base.

## 4. Guardar en Git y publicar

Revisa los cambios:

```sh
git diff --stat
```

Guarda los archivos de esta corrección:

```sh
git add src/components/treasury/KpiCard.tsx src/financial-engine/types.ts src/import-engine src/pages/CashFlow.tsx src/pages/Dashboard.tsx src/pages/Integrations.tsx src/pages/Investments.tsx src/pages/importations/ImportPreview.tsx src/services/dataService.ts src/services/importService.ts tests/database.test.ts tests/import.test.ts tests/sonacol.test.ts supabase/migrations/20260914010000000_sonacol_workbook.sql package.json ACTUALIZACION.md CORRECCION_EXCEL.md
git commit -m "Corrige importacion CAJA SONACOL y verifica datos guardados"
git push
```

Si tu alojamiento está conectado a esa rama de Git, espera a que termine su despliegue. Si no lo está, publica los cambios desde el panel de tu alojamiento. `git push` por sí solo no garantiza que la aplicación de Enter o tu sitio publicado se actualicen.

La compilación genera `dist/`. Mantén las variables de Supabase que corresponden a tu app al compilar/publicar.

## 5. Importar tu Excel original

1. Abre la app actualizada con un usuario de Tesorería o Administrador.
2. Entra a **Importaciones** y selecciona tu `.xlsm` original.
3. Debe aparecer **Formato CAJA SONACOL**, con 1.781 filas listas y 8 advertencias para el archivo probado.
4. Revisa las advertencias y pulsa **Importar 1789 filas**. La vista previa todavía no guarda datos.
5. Al terminar, revisa Bancos, Flujo de Caja → Movimientos, Cuentas por Cobrar, Inversiones y Proyecciones.
6. En Integraciones, el contador se calcula con los registros que realmente existen. Los registros antiguos «Success» sin trazabilidad aparecerán como «Sin verificar».

En una base vacía se guardaron 1.789 registros y se relacionaron cinco clientes. Si ya tienes datos, los duplicados y conflictos pueden reducir los nuevos registros; consulta el resultado del lote.

**Revisión del libro:** COLOCACIONES y el resumen INVERSIONES muestran totales diferentes. Se importa el detalle COLOCACIONES. Las tasas no informadas se muestran como tales. Consulta `DIAGNOSTICO.md` para ver los resultados de la prueba.

Si aparece «Falta actualizar la base de datos», revisa el paso 2 y comprueba que el Supabase actualizado es el mismo al que apunta la app.
