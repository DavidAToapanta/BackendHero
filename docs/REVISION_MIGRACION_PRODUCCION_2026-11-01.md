# Revisión de migraciones y producción

Fecha: 2026-11-01. Alcance: diagnóstico del backend y consultas de solo lectura.

Actualización posterior: el ensayo autorizado, el archivo del historial y la
baseline preparada se documentan en
[ENSAYO_RECONCILIACION_PRODUCCION_2026-11-01.md](ENSAYO_RECONCILIACION_PRODUCCION_2026-11-01.md).
Este documento conserva el diagnóstico inicial, previo a esos cambios locales.

## Resultado

No hace falta copiar los datos de desarrollo hacia producción. Los datos reales
deben permanecer en producción; se trasladan el código y las migraciones que
correspondan. Actualmente ambas bases ya coinciden con `prisma/schema.prisma`.
El problema encontrado es la divergencia del historial de migraciones.

No ejecutar todavía `prisma migrate deploy`: hay una migración pendiente cuyo SQL
no es compatible con el estado actual de producción.

## Qué se comprobó

Se usaron las conexiones existentes de `.env` y `.env.production.real`, sin
mostrar credenciales. El servidor confirmó estas identidades:

| Comprobación | Desarrollo | Producción configurada |
| --- | --- | --- |
| Base | `hero_gym_dev` | `SistemaGym` |
| Puerto local de acceso | 5433 | 5434 |
| PostgreSQL | 16.13 | 18.6 |
| Tablas de aplicación, sin `_prisma_migrations` | 33 | 33 |
| Migraciones completadas y no revertidas | 26 | 22 |
| Intentos históricos marcados como revertidos | 0 | 2 |
| Fallos pendientes, sin completar ni marcar como revertidos | 0 | 0 |
| Diferencias contra el esquema Prisma, según `migrate diff` | Ninguna | Ninguna |

Los intentos marcados como revertidos no son migraciones adicionales pendientes.
Producción tiene 24 filas en `_prisma_migrations`, pero solo 22 ejecuciones
completadas y no revertidas. Una migración de `StaffProfile` figura completada
con cero pasos, compatible con haber sido marcada como aplicada; la consulta
del catálogo confirmó que su tabla, índices y relaciones existen actualmente.

También se compararon columnas, tipos, nulabilidad, valores por defecto, enums,
índices y restricciones. Las diferencias de representación de `NOT NULL` en el
catálogo de PostgreSQL 18 se distinguieron de diferencias reales del esquema.

El CLI instalado es Prisma 6.10.1. `prisma validate` pasó y las dos comparaciones
`migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code`
terminaron con código 0 y `No difference detected`.

Las conexiones SQL se abrieron con `default_transaction_read_only=on`, límites
de consulta/bloqueo y transacciones `REPEATABLE READ READ ONLY`, cerradas con
`ROLLBACK`. Las conexiones del diagnóstico de Prisma también recibieron la
opción de solo lectura. No se ejecutaron migraciones, seeds, escrituras de datos
ni cambios del historial.

## Datos e integridad observados

Desarrollo no está completamente vacío: contiene pocos registros, cuyo carácter
de prueba no se verificó. No conviene transferirlos a producción.

| Tabla | Desarrollo | Producción |
| --- | ---: | ---: |
| Usuario | 2 | 59 |
| Cliente | 1 | 62 |
| ClientePlan | 2 | 153 |
| Factura | 2 | 153 |
| Pago | 3 | 124 |
| Deuda | 1 | 14 |
| Asistencia | 0 | 725 |
| IngresoRapido | 0 | 212 |
| Plan | 1 | 22 |
| Producto | 1 | 5 |
| Compra | 0 | 3 |
| Tenant | 2 | 4 |

Los conteos son una fotografía de la consulta, no un respaldo. `Cliente` y
`Usuario` no tienen que coincidir en cantidad: un usuario puede tener perfiles
de cliente en varios negocios.

Se verificaron las 56 relaciones con clave foránea de cada base. No se
encontraron referencias huérfanas ni diferencias de `tenantId` entre registros
relacionados cuando ambos lados poseen esa columna. Todas las restricciones
consultadas figuraban validadas. No se encontraron secuencias autoincrementales
atrasadas respecto al máximo identificador de su tabla; se consultaron sus
valores sin llamar a `nextval` ni `setval`.

Esto no sustituye una revisión funcional de saldos, permisos y operaciones ni
demuestra que una migración conserve datos: no se ensayó ninguna migración.

## Divergencias que impiden recomendar un despliegue directo

### Cuatro migraciones faltan en el historial de producción

1. `20260604100000_add_cliente_activo`
2. `20260604101000_add_cliente_plan_estado`
3. `20260604102000_sync_training_schema`
4. `20260605100000_sync_remaining_schema_drift`

Sus efectos estructurales ya están presentes en producción, según el catálogo y
la comparación con Prisma. Esto indica cambios previos fuera de este historial,
pero no permite determinar cómo se hicieron. Los cuatro archivos estaban sin
seguimiento en Git al comenzar esta revisión; deben incluirse en la revisión y
en la versión que se publique.

La tercera migración tiene un problema concreto: contiene
`ALTER TABLE "SemanaEjercicio" DROP CONSTRAINT IF EXISTS ...`, pero
`SemanaEjercicio` ya no existe en producción. `IF EXISTS` se refiere a la
restricción, no a la tabla. Ejecutar ese SQL en este estado produciría un error.
Aunque sus pasos anteriores incluyen protecciones, no debe reejecutarse a ciegas.
Además contiene operaciones de copia de datos, cambios de relaciones y borrado
de tablas/columnas antiguas. Las tablas de entrenamiento consultadas están
actualmente vacías en ambas bases.

### Dos migraciones antiguas tienen contenido distinto

- `20260315000500_add_tenant_to_gym_secondary`
- `20260315001000_enforce_tenant_gym_secondary`

Sus SHA-256 en producción no coinciden con los archivos actuales, incluso al
admitir finales de línea LF y CRLF. Desarrollo sí coincide con los archivos
actuales. Se encontraron las versiones que coinciden con producción en el
commit local `5c1bde7e617e9ac79a65296725dee946dd61fb68`.

Las versiones actuales agregan comprobaciones de existencia para las tablas de
entrenamiento. No se trata solo de formato. Restaurar los originales tampoco
debe hacerse sin probar la reconstrucción completa, porque esas versiones
suponen que determinadas tablas ya existen. No se modificó ninguno de estos
archivos ni los checksums almacenados.

## Procedimiento recomendado

1. **Conservar producción como fuente de los datos reales.** No restaurar sobre
   ella una exportación de desarrollo ni ejecutar `migrate reset`, `migrate dev`
   o `db push --accept-data-loss` para resolver esta divergencia.
2. **Crear un respaldo y probar su restauración en una base aislada.** Usar una
   copia de PostgreSQL 18 para aproximarse a producción. El `pg_dump` 16 del
   entorno de desarrollo no puede exportar un servidor 18; usar un cliente 18
   compatible. No asumir que un dump de PostgreSQL 18 se restaura correctamente
   en PostgreSQL 16. No se creó ningún respaldo durante esta revisión.
3. **Ensayar la reconciliación sobre esa copia.** Para las cuatro migraciones
   pendientes, verificar todos sus efectos, incluidos los de datos y secuencias.
   Dado que la estructura ya existe, la vía candidata es registrarlas mediante
   `prisma migrate resolve --applied <nombre>`, sin reejecutar su SQL. Ese comando
   sí escribe en `_prisma_migrations`: no se ejecutó aquí y debe probarse antes.
4. **Resolver también las dos variantes históricas.** Conservar sus originales y
   documentar la procedencia; acordar un historial canónico y probar tanto una
   instalación vacía como la actualización de la copia. `resolve --applied` no
   repara los checksums de migraciones que ya figuran completadas. Si el historial
   antiguo exige pasos manuales que impiden reproducirlo, preparar un baseline
   controlado, con respaldo y procedimiento propio; no borrar el historial ni
   editar checksums como arreglo improvisado.
5. **Verificar aplicación y datos en la copia.** Comprobar identificadores,
   relaciones, conteos y totales financieros antes/después; probar login y
   selección de contexto, aislamiento por negocio, clientes, planes, pagos,
   facturas, compras y asistencias. Ejecutar lint, pruebas y build para la versión
   candidata. El lint del proyecto aplica correcciones, por lo que no se ejecutó
   durante esta revisión de solo lectura.
6. **Aplicar el procedimiento ensayado a producción en una ventana acordada.**
   Tener un respaldo reciente y recuperación definida, controlar las escrituras
   concurrentes y verificar después del cambio. Para futuras modificaciones
   reales del esquema, versionar SQL revisado y usar `prisma migrate deploy`
   después de ensayarlo con datos representativos. No basta con compilar o
   desplegar la imagen: el `Dockerfile` actual genera Prisma Client y arranca
   Nest, pero no ejecuta migraciones.

La propuesta STORE de `DISENO_BASE_DATOS_STORE.md` sigue siendo documentación:
sus tablas comerciales nuevas no están implementadas en el esquema revisado.
Publicar esta versión no las crearía.

## Referencias

- [Prisma 6: desarrollo y producción](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
- [Prisma 6: reconciliar cambios ya presentes](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing)
- [Prisma 6: baseline de una base existente](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining)
- [PostgreSQL 18: pg_dump y compatibilidad](https://www.postgresql.org/docs/18/app-pgdump.html)

No se modificaron bases, código de aplicación ni migraciones. Solo se generaron
este informe y archivos locales de diagnóstico en `.tmp`, sin credenciales ni
filas con información personal. No se desplegó ninguna versión.
