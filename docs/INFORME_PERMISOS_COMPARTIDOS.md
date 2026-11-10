# Informe del punto 5 · Roles y permisos compartidos

**Punto 5 terminado como base interna.** `@app/permisos` permite preparar y evaluar autorización
por negocio. Gym conserva sus rutas, guards y JWT actuales en `LEGACY`.
El único controlador que usa el evaluador HTTP está en la prueba de
integración. La preparación se invoca explícitamente y conserva el modo
del negocio.

## Cómo se conecta el flujo

| Entrada | Recorrido hasta PostgreSQL |
| --- | --- |
| `PreparacionPermisosService.preparar(contexto)` | Comprueba la identidad, la vigencia de la membresía y que el actor sea `OWNER` en un negocio activo en `LEGACY`. Registra el catálogo fijo, crea los roles base protegidos que falten y completa las asignaciones de las membresías activas. Conserva las asignaciones existentes y devuelve las discrepancias con el rol legacy. |
| `RolesNegocioService.crear/editar(contexto, …)` | Verifica al gestor y el alcance de los permisos. Guarda el rol en `RolNegocio` y sus permisos en `RolPermiso`. Un cambio de permisos o de estado del rol incrementa `UserTenant.versionAutorizacion` en las membresías vinculadas, dentro de la misma transacción. |
| `AsignacionesRolService.asignar/retirar(contexto, …)` | Verifica el negocio del actor, el rol y la membresía. Escribe o retira la asignación vigente y registra al asignador al crear o sustituir. Actualiza la versión de la membresía en esa misma transacción. Repetir la asignación vigente conserva la versión. |
| `PermisosService.autorizar(contexto, codigo)` | Recibe un contexto que el consumidor ya autenticó. Lee en PostgreSQL el modo, los estados, la versión, el rol asignado y el módulo. En `PERMISOS` exige una asignación activa y el permiso en un módulo habilitado. Rechaza un contexto con versión anterior. |
| Cambio de vinculación en Negocios | Cambiar de verdad el rol legacy o el estado de una membresía actualiza su versión en la misma escritura. Asegurar una vinculación existente solo incrementa la versión si cambia alguno de esos valores. |

En `LEGACY`, la preparación y la gestión interna se reservan a `OWNER`.
En `PERMISOS`, la autoridad de `OWNER` procede de su rol protegido asignado.
Otros gestores requieren el permiso explícito del módulo y solo pueden
delegar permisos que ya poseen, que sean delegables y que pertenezcan a un
módulo activo. Se protegen las asignaciones de propiedad, la autoasignación
y la edición del rol propio. Los gestores delegados tampoco pueden modificar
roles o asignaciones protegidas.

El catálogo inicial contiene seis códigos para gestión de roles, personal de
Gym y catálogo de Tienda. La plantilla `ADMIN` nueva recibe gestión y lectura
en los módulos activos al prepararla. Las demás plantillas salvo `OWNER` y
`ADMIN` conservan la equivalencia sin conceder permisos iniciales. `OWNER`
tiene acceso implícito al catálogo conocido en los módulos habilitados. Estas
plantillas se limitan a la base interna de este punto.

## Archivos creados

| Archivo | Responsabilidad |
| --- | --- |
| `libs/permisos/src/catalogo-permisos.ts` | Catálogo de la aplicación y metadatos de delegación. |
| `libs/permisos/src/permisos.service.ts` | Registro idempotente, resolución del acceso y techo de delegación. |
| `libs/permisos/src/roles-negocio.service.ts` | Alta y edición de roles, permisos y actualización de versiones. |
| `libs/permisos/src/asignaciones-rol.service.ts` | Alta, sustitución y retirada de la asignación vigente. |
| `libs/permisos/src/preparacion-permisos.service.ts` | Preparación en `LEGACY` y reporte de discrepancias. |
| `libs/permisos/src/permisos.module.ts` | Módulo Nest que registra y exporta los servicios. |
| `libs/permisos/src/index.ts` | Entrada pública de `@app/permisos`. |
| `libs/permisos/tsconfig.lib.json` | Configuración de compilación de la librería. |
| `libs/permisos/src/permisos.spec.ts` | Pruebas de resolución de acceso, contexto y catálogo. |
| `test/permisos-postgres.e2e-spec.ts` | Pruebas con PostgreSQL y una ruta de ensayo con JWT propio. |
| `docs/INFORME_PERMISOS_COMPARTIDOS.md` | Inventario, flujos y verificaciones del punto 5. |

## Archivos modificados en este punto

| Archivo | Responsabilidad del cambio |
| --- | --- |
| `libs/negocios/src/membresias-personal.service.ts` | Incrementa la versión junto con los cambios reales de rol y estado. |
| `libs/negocios/src/negocios.spec.ts` | Verifica el alcance y la escritura de versión en la transacción recibida. |
| `apps/gym-api/src/staff/staff.service.spec.ts` | Adapta la prueba de inactivación y reactivación al incremento de versión. |
| `apps/gym-api/src/tenant/tenant.service.spec.ts` | Adapta la prueba de asignación legacy a la escritura transaccional. |
| `nest-cli.json` | Registra el proyecto `permisos`. |
| `tsconfig.json` | Registra el alias TypeScript. |
| `package.json` | Incorpora la librería a Jest, cobertura, lint y formato. |
| `test/jest-e2e.json` | Resuelve `@app/permisos` en integración. |
| `docs/ARQUITECTURA_BACKEND.md` | Describe la conexión entre Seguridad, Negocios y Permisos. |
| `docs/MAPA_MODELOS_BACKEND.md` | Actualiza la ubicación y responsabilidad de los cuatro modelos. |
| `libs/README.md` | Agrega Permisos al índice de librerías. |

## Antes de activar PERMISOS en Gym

El siguiente bloque deberá completar el catálogo por ruta, conectar el contexto
versionado con login y selección de contexto, y adaptar los guards y los
consumidores que verifican JWT por separado. También deberá conciliar las
asignaciones y definir la transición para las vinculaciones pendientes e
inactivas. La decisión de cambiar el modo de un negocio será explícita.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Jest unitario | 215 pruebas aprobadas en 47 suites. |
| Integración general con Permisos | 21 pruebas aprobadas. Incluye las cuatro pruebas nuevas con PostgreSQL y la compatibilidad HTTP y WebSocket de Gym. |
| Regresiones de Identidad, Negocios e Inventario | 9 pruebas adicionales aprobadas en tres bases aisladas. La suite optativa de migración de Tienda quedó sin ejecutar. |
| TypeScript | `tsc --noEmit --incremental false` aprobado. |
| Compilación | `npm run build` y `nest build permisos` aprobados. Se verificaron los artefactos de Gym y de la librería en `dist/`. |
| ESLint sin correcciones | 387 errores y 78 advertencias antes y después. Cero hallazgos nuevos por archivo, regla y mensaje. |

La suite de Permisos usa `PERMISOS_POSTGRES_E2E=1` y una base PostgreSQL
local desechable llamada `hero_permisos_test`. El cambio a `PERMISOS` se
realiza en los datos de ensayo para verificar el evaluador. La prueba de
reversión observa el permiso y la versión nuevos dentro de la transacción,
provoca un error de clave foránea `P2003` y confirma que la versión y el acceso
anteriores se conservan después del fallo.
