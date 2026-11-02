# Ensayo de reconciliación de producción

Fecha local: 2026-11-01. Estado actualizado: el usuario informó que aplicó la
reconciliación en producción. Una comprobación posterior del agente, únicamente
de lectura, confirmó `baselineAlreadyRecorded: true`, `schemaMatches: true` y
`legacyHistoryMatches: true`. El agente no ejecutó cambios sobre producción ni
publicó una versión del backend.

## Resultado comprobado

Se respaldó `SistemaGym` mediante `pg_dump` 18.6, conectado en modo de solo
lectura. El dump y las comprobaciones del origen utilizaron la misma instantánea
exportada desde una transacción `REPEATABLE READ READ ONLY`, para evitar una
comparación entre momentos distintos si la aplicación sigue operando.

Se restauró el archivo en un contenedor independiente PostgreSQL 18.6. No se
reutilizó el contenedor de desarrollo, ni su volumen, ni sus puertos. El acceso
del contenedor de ensayo está publicado únicamente en `127.0.0.1:51731`.

Se usó la imagen oficial de PostgreSQL obtenida desde la caché pública de Google,
fijada por digest:

```text
mirror.gcr.io/library/postgres@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5
```

### Respaldo y evidencia local

Directorio, relativo a la raíz del repositorio:

```text
.tmp/production-rehearsal-20261102004409331-69dca8/
```

El nombre contiene la fecha UTC; la fecha local del trabajo es 2026-11-01.

- Archivo: `production.dump`, formato custom de PostgreSQL.
- Tamaño: 147909 bytes.
- SHA-256: `a70be4b20d04ec0c957bc9df8cba3a223f0c8c6fe8e2b9d9601b732ff754dfb2`.
- `backup-manifest.json`: ubicación y huella del respaldo.
- `source-fingerprint.json`: comprobaciones de la misma instantánea del origen.
- `restore-verification.json`: restauración verificada, cero diferencias.
- `reconciliation-verification.json`: conservación durante la reconciliación.
- `smoke-verification.json`: pruebas del backend compilado.
- `final-verification.json`: comprobación final, incluida producción en solo lectura.
- `.tmp/baseline-hero_replay-*.json`: antes/después del procedimiento definitivo.

El respaldo contiene datos reales y debe permanecer privado. `.tmp` está
excluido de Git; también se excluyeron temporales, archivos `.env` y respaldos
del contexto Docker para impedir que entren en una imagen. No se subió el dump
a un servicio externo ni se incluyó en un commit.

La revisión para Git añadió exclusiones globales para `*.dump` y `*.backup`.
También fijó la baseline activa a LF mediante `.gitattributes`, conservó los
archivos históricos sin conversión de bytes y normalizó a LF únicamente la
huella del schema. Se verificó que la comprobación del schema coincide con
finales de línea Windows y Linux, y que baseline y archivo histórico no cambiaron.

Este es un respaldo de la base, no de toda la instancia Cloud SQL, IAM, roles
globales o configuración del servicio. La restauración aislada usó
`--no-owner --no-privileges`, con un usuario local de pruebas. Los permisos de
una recuperación en infraestructura productiva requieren su propio mapeo.

## Cómo se resolvió el historial

La rama local `fix/prisma-migration-history` ya contenía una baseline del mismo
esquema. Se recuperaron sus bytes, se verificó que el schema de esa rama no
difiere del actual y se repitieron las pruebas actuales con datos de producción.
No se asumieron como vigentes los resultados documentados en aquella rama.

Historial activo preparado:

```text
prisma/migrations/0_init/migration.sql
```

SHA-256: `a274f57ca36b0d7ce43d0f22397241fb08cf7770abc13dda38c0cb0492a47413`.

La baseline conserva el orden físico del enum `EstadoDevolucion` y la secuencia
`cliente_id_seq` de tipo bigint. Son detalles del catálogo que la generación
declarativa de Prisma por sí sola no reproduce exactamente.

Las 26 migraciones anteriores se archivaron, sin cambiar sus bytes, en
`prisma/migrations_legacy/`. `manifest.json` registra sus huellas. También se
conservaron en `production-variants/` las dos versiones antiguas recuperadas
del commit `5c1bde7e617e9ac79a65296725dee946dd61fb68`, cuyos checksums coinciden
con producción. Los cuatro archivos que ya estaban sin seguimiento en Git al
iniciar la tarea también se preservaron en el archivo histórico.

Sobre las copias existentes se ejecutó únicamente:

```text
prisma migrate resolve --applied 0_init
```

Esto añadió el registro de la baseline sin ejecutar su SQL, sin borrar las 24
filas anteriores de `_prisma_migrations` y sin modificar sus checksums.
Las cuatro migraciones de junio no se reejecutaron ni se marcaron por separado:
el historial activo parte ahora del estado final verificado.

## Pruebas de conservación y reproducibilidad

Se usaron cuatro bases aisladas:

| Base | Uso | Resultado |
| --- | --- | --- |
| `hero_empty` | Crear el esquema desde cero mediante `migrate deploy` | Correcto |
| `hero_restore` | Restaurar y ensayar baseline con historial antiguo | Correcto |
| `hero_replay` | Segunda restauración y procedimiento final, incluida repetición | Correcto e idempotente |
| `hero_smoke` | Copia restaurada para pruebas HTTP y operaciones sintéticas | Correcto |

La comparación incluyó las 33 tablas de negocio y `_prisma_migrations`;
huellas del contenido de todas las filas, conteos, totales financieros y valores
de secuencias. No se guardaron filas personales en las salidas de diagnóstico:
los hashes se calcularon dentro de PostgreSQL.

Se compararon asimismo columnas, tipos, valores por defecto, nulabilidad,
restricciones, índices, enums con su orden, estructura y ownership de
secuencias, funciones, triggers, vistas, vistas materializadas, extensiones y
políticas/configuración RLS. No se comparó el dueño del objeto con el usuario de
producción, ya que la restauración usa otro usuario.

Resultados:

- Restauración vs. la instantánea del origen: cero diferencias.
- Esquema de la baseline vacía vs. esquema restaurado: cero diferencias.
- Reconciliación: cero cambios en datos de negocio, totales y secuencias.
- Historial antiguo: todas las filas conservadas; se añadió solo `0_init`.
- `migrate status`: base al día.
- `migrate deploy` sobre la copia ya reconciliada: ninguna migración pendiente.
- Procedimiento final repetido: reconoce que `0_init` ya existe, sin duplicarlo.

Las comprobaciones preservan los saldos tal como están; no pretenden conciliar
ni corregir posibles discrepancias financieras históricas.

## Verificación del backend

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Falló: 374 errores y 79 advertencias existentes, tras las correcciones automáticas de formato |
| `npm test -- --runInBand` | 38 suites, 155 pruebas correctas |
| `npm run build` | Correcto |
| `npm run test:e2e -- --runInBand` | 1 suite, 1 prueba correcta; termina cerrando la aplicación |
| ESLint de los archivos TypeScript cambiados | Cero errores y advertencias |
| Pruebas HTTP sobre `dist` compilado | 16 comprobaciones correctas |

Los cambios automáticos del lint ajenos a esta tarea fueron retirados usando
una copia previa de los archivos; no se cambió la lógica financiera ni de roles.
El lint global sigue siendo una condición pendiente para considerar limpio un
despliegue completo de aplicación. No se desactivaron reglas para ocultarlo.

Se hicieron ajustes mínimos para que la prueba E2E existente pudiera verificar
el arranque: registrar `AppController`/`AppService`, resolver imports `src/*` en
Jest E2E y cerrar la aplicación al terminar.

Las pruebas HTTP verificaron lectura de datos restaurados con los contextos
staff existentes; alta e inicio de sesión de propietarios sintéticos; dos
perfiles del mismo cliente en negocios distintos; selección de contexto;
rechazo de acceso anónimo y de clientes a rutas staff; uso del tenant del token;
rechazo de lecturas y pagos desde otro negocio; asignación de plan y factura;
pago con saldo y deuda resultantes; compra con un único descuento de stock; y
asistencia con un plan vigente.

Los datos sintéticos se crearon solo en `hero_smoke`. Después se comprobó que
las filas que existían antes de esas operaciones conservaban sus huellas en las
33 tablas. También se ejecutaron las pruebas sobre el módulo compilado de
`dist`, sin depender del cargador de TypeScript.

## Procedimiento ensayado para producción

La herramienta `scripts/reconcile-baseline.cjs` hace solo lectura por defecto.
Comprueba el nombre real de la base, el esquema completo contra el catálogo
ensayado, la huella del schema/baseline, el historial antiguo, el hash del dump
y la evidencia de restauración. Además ejecuta `migrate diff` con solo lectura.

Durante la preparación se ejecutó sobre `SistemaGym` **sin `--apply`** y se
confirmó que entonces no tenía el registro `0_init`. Después de que el usuario
informó su aplicación, una nueva comprobación de solo lectura confirmó que ya
está registrado y que esquema e historial antiguo siguen coincidiendo con lo
ensayado. No es necesario volver a registrarlo. En el ensayo anterior, desarrollo
conservaba sus 26 registros antiguos y el agente tampoco lo modificó.

Antes de aplicar, acordar una ventana sin escrituras administrativas ni otros
procesos de migración. Si el respaldo supera 60 minutos, la herramienta rechaza
la aplicación: hay que crear y verificar uno nuevo, sin sobrescribir el anterior.

Desde la raíz del proyecto, primero ejecutar el control de solo lectura:

```powershell
node scripts/reconcile-baseline.cjs --env-file .env.production.real --database SistemaGym --backup-manifest .tmp/production-rehearsal-20261102004409331-69dca8/backup-manifest.json
```

**Solo después de la aprobación final**, ejecutar exactamente el mismo comando
añadiendo `--apply`:

```powershell
node scripts/reconcile-baseline.cjs --env-file .env.production.real --database SistemaGym --backup-manifest .tmp/production-rehearsal-20261102004409331-69dca8/backup-manifest.json --apply
```

La única mutación prevista es registrar `0_init` con Prisma. No ejecutar
`migrate deploy` para crear la baseline sobre una base poblada, ni SQL del
archivo histórico. El programa conserva evidencia del antes/después en `.tmp`
y verifica datos, secuencias, historial y `migrate status` tras registrar la fila.

La ejecución con `--apply` se ensayó dos veces sobre `hero_replay`, no sobre
producción. Si cambian los archivos, el historial o el esquema, la herramienta
se detiene en lugar de intentar repararlos.

Esta operación no publica el backend ni incorpora las tablas propuestas para
STORE. El siguiente despliegue debe incluir tanto la baseline como el archivo
histórico. Cada base existente, incluida desarrollo, necesita su reconciliación
verificada antes de usar el historial nuevo. Una base vacía sí recibe
`prisma migrate deploy` normalmente. No se debe aceptar un reset para resolverlo.

## Recuperación ante fallos

1. Si falla una comprobación previa, detenerse: el control no habrá escrito en
   la base. Revisar la divergencia sin usar `reset`, `db push` o borrados.
2. Si falla o se interrumpe `resolve`, volver al control de solo lectura. El
   programa distingue una baseline ya registrada de una pendiente, y rechaza
   registros incompletos o de otra huella. No reejecutar SQL de creación.
3. Si falla la verificación posterior, conservar el dump y la evidencia y
   detener cualquier despliegue o escritura de migraciones. No restaurar el
   dump encima de producción automáticamente: podría sobrescribir operaciones
   legítimas posteriores al respaldo.
4. Si se requiere recuperar datos, restaurar el dump en **otra base nueva** con
   PostgreSQL 18, verificar su contenido y relaciones y después planificar el
   cambio de conexión de la aplicación. Esa restauración ya fue ensayada en
   dos bases distintas. Configurar propietarios/permisos de destino antes de
   cambiar el servicio. La base productiva original se conserva para investigar.

Registrar una baseline no cambia el contrato de la aplicación ni los datos del
negocio. Revertir un despliegue de aplicación no requiere deshacer ese registro.
No hay motivo para borrar las filas históricas o alterar checksums.

## Límite actual

La reconciliación de producción comunicada por el usuario quedó confirmada en
solo lectura; esa condición previa para integrar la baseline ya está cumplida.
El agente no hizo commit, push, merge ni despliegue ni modificó las bases. El lint
global existente queda documentado como deuda de calidad separada; esta
verificación no equivale a aprobar todos los cambios previos de la rama `dev`.

Referencia del enfoque: [baselining en Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining).
