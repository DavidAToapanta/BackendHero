# Informe del punto 4 · Negocios y membresías del personal

**Punto 4 terminado.** `@app/negocios` comparte las operaciones sobre `Tenant`, `TenantModule` y
`UserTenant` mediante `@app/prisma`. Gym conserva las rutas, los DTO, las reglas
de acceso, la rotación de la clave del bridge y los perfiles laborales.
`ClientePlan` sigue representando la membresía deportiva dentro de Gym.

## Cómo funciona

| Entrada | Recorrido hasta PostgreSQL |
| --- | --- |
| `POST /tenants` | El controlador de Gym llama a `TenantService`, que normaliza los datos, resuelve el slug, valida el propietario opcional y decide los módulos iniciales según el tipo de negocio. `NegociosService.crear` usa una escritura anidada de Prisma para guardar `Tenant`, sus filas de `TenantModule` y, cuando se proporciona un propietario, `UserTenant` con rol `OWNER` y estado `ACTIVO`. Gym define el detalle de la respuesta. |
| `GET /tenants`, `GET /tenants/:id` y `PATCH /tenants/:id/saas-plan` | `TenantService` delega las consultas y la actualización en `NegociosService`. El listado conserva su orden y el cambio de plan conserva la respuesta idempotente. Asistencia y ZKBio usan la consulta compartida del plan para aplicar sus propias reglas. |
| `POST /auth/register-owner` | `AuthService` abre una transacción de Prisma. Identidad crea la cuenta y los servicios de Negocios crean `Tenant`, vinculan al `OWNER` y registran el módulo `GYM` activo con la misma transacción. Gym ejecuta el login después de confirmar las cuatro escrituras. |
| `POST /auth/login` y `POST /auth/select-context` | Gym valida credenciales o el token de selección según la ruta. `MembresiasPersonalService` lee los `UserTenant` activos de negocios activos. Gym combina esas vinculaciones con los contextos de cliente, comprueba el acceso solicitado y emite los mismos JWT. |
| `POST /staff` y `PATCH /staff/:usuarioId` | `StaffController` obtiene el negocio del JWT. Gym coordina la cuenta, la vinculación y el perfil. Al registrar, Identidad crea la cuenta si corresponde y Negocios crea `UserTenant`. En la edición, Negocios aplica el cambio de rol y Gym actualiza el perfil si corresponde. En ambos flujos, las escrituras de la operación usan la misma transacción. |
| Listado, detalle, inactivación y reactivación en `/staff` | Gym lee la vista de personal con los filtros actuales. Negocios actualiza el estado de la vinculación por ID y negocio. El rol, el estado y los perfiles de esa misma cuenta en otro negocio conservan sus valores. |
| Habilitación y consulta de módulos | El alta de negocio define la habilitación inicial. El flujo legacy de Gym asegura `gym-principal`, su módulo `GYM` activo y, cuando corresponde, la vinculación del personal. Catálogo consulta la clave negocio + módulo mediante `ModulosNegocioService` y conserva el `403` para módulos deshabilitados o ausentes. |
| Registro de una compra | Compras busca la vinculación activa del responsable mediante `MembresiasPersonalService` con el mismo cliente de transacción que utiliza para la compra. Gym sigue decidiendo cómo responder si falta esa vinculación. |

La futura `tienda-api` podrá importar `NegociosModule` en sus módulos de
configuración, autenticación y personal. Podrá compartir los mismos negocios,
habilitaciones y vinculaciones de PostgreSQL y aplicar sus propias reglas de
acceso y de presentación.

## Archivos creados

| Archivo | Responsabilidad |
| --- | --- |
| `libs/negocios/src/negocios.service.ts` | Alta, consulta, listado, búsqueda por slug y actualización del plan. |
| `libs/negocios/src/modulos-negocio.service.ts` | Consulta, registro y habilitación de módulos. |
| `libs/negocios/src/membresias-personal.service.ts` | Vinculación, consultas de acceso, cambios de rol y estado. |
| `libs/negocios/src/negocios.module.ts` | Registra y exporta los servicios Nest con Prisma. |
| `libs/negocios/src/index.ts` | Entrada pública de `@app/negocios`. |
| `libs/negocios/src/negocios.spec.ts` | Prueba la escritura anidada, los filtros y el uso de la transacción recibida. |
| `libs/negocios/tsconfig.lib.json` | Configura la compilación independiente. |
| `test/negocios-postgres.e2e-spec.ts` | Verifica los contratos de negocios y personal, el aislamiento y las reversiones en PostgreSQL. |
| `docs/INFORME_NEGOCIOS_COMPARTIDOS.md` | Documenta flujos, archivos y verificaciones. |

## Archivos modificados en este punto

| Archivo | Responsabilidad del cambio |
| --- | --- |
| `apps/gym-api/src/tenant/tenant.module.ts` | Importa `NegociosModule`. |
| `apps/gym-api/src/tenant/tenant.service.ts` | Delega las operaciones comunes y conserva el detalle de Gym y las reglas legacy. |
| `apps/gym-api/src/tenant/tenant.service.spec.ts` | Ejecuta las pruebas del negocio con los servicios compartidos. |
| `apps/gym-api/src/auth/auth.module.ts` | Agrega `NegociosModule` a las dependencias de Auth. |
| `apps/gym-api/src/auth/auth.service.ts` | Delega el alta de negocio, vinculación y módulo, y consulta vinculaciones para resolver contextos. |
| `apps/gym-api/src/auth/auth.service.spec.ts` | Verifica las operaciones de Auth con los proveedores compartidos. |
| `apps/gym-api/src/staff/staff.module.ts` | Importa `NegociosModule` junto a Identidad. |
| `apps/gym-api/src/staff/staff.service.ts` | Delega la vinculación y los cambios de rol y estado. |
| `apps/gym-api/src/staff/staff.service.spec.ts` | Registra el proveedor compartido y verifica el alcance por negocio de las actualizaciones. |
| `apps/gym-api/src/compra/compra.module.ts` | Importa `NegociosModule` para consultar al responsable. |
| `apps/gym-api/src/compra/compra.service.ts` | Usa la consulta compartida de vinculación activa dentro de la transacción. |
| `apps/gym-api/src/compra/compra.service.spec.ts` | Ejecuta los casos de compra con el proveedor de vinculaciones. |
| `apps/gym-api/src/asistencia/asistencia.module.ts` | Importa `NegociosModule` para consultar el plan. |
| `apps/gym-api/src/asistencia/asistencia.service.ts` | Delega la lectura del plan SaaS para la asistencia biométrica. |
| `apps/gym-api/src/asistencia/asistencia.service.spec.ts` | Registra el proveedor compartido en las pruebas. |
| `apps/gym-api/src/integrations/zkbio/zkbio.module.ts` | Importa `NegociosModule` para consultar el plan. |
| `apps/gym-api/src/integrations/zkbio/zkbio.service.ts` | Delega la lectura del plan al consultar el estado de acceso. |
| `apps/gym-api/src/integrations/zkbio/zkbio.service.spec.ts` | Registra el proveedor compartido en las pruebas. |
| `libs/catalogo/src/catalogo.module.ts` | Importa `NegociosModule`. |
| `libs/catalogo/src/categorias-producto.service.ts` | Consulta la habilitación del módulo con el servicio compartido. |
| `libs/catalogo/src/catalogo.service.spec.ts` | Verifica el comportamiento de Catálogo con el servicio de módulos. |
| `test/inventario-postgres.e2e-spec.ts` | Conecta el nuevo proveedor requerido por Compras en la suite de inventario. |
| `nest-cli.json` | Registra el proyecto de librería `negocios`. |
| `tsconfig.json` | Resuelve el alias `@app/negocios`. |
| `package.json` | Incluye Negocios en Jest unitario, cobertura, lint y formato. |
| `test/jest-e2e.json` | Resuelve el alias en Jest de integración. |
| `docs/ARQUITECTURA_BACKEND.md` | Registra la ubicación de la librería y sus límites. |
| `docs/MAPA_MODELOS_BACKEND.md` | Actualiza las responsabilidades de los modelos compartidos. |
| `libs/README.md` | Agrega Negocios al índice de librerías. |

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias | 210 aprobadas en 46 suites. |
| Integración general con Negocios habilitado | 21 aprobadas, incluidas las pruebas HTTP y WebSocket de Gym y las cuatro nuevas pruebas con PostgreSQL. |
| Integración de Identidad e Inventario | 2 de Identidad y 3 de Inventario aprobadas en ejecuciones separadas con sus bases de ensayo. La suite optativa de migración Store quedó sin ejecutar. |
| Reversión del propietario | PostgreSQL rechazó `UserTenant` con `P2003`. La cuenta y el negocio existían dentro de la transacción y ambas consultas devolvieron `null` después del fallo. |
| Reversión de personal | PostgreSQL rechazó `StaffProfile` con `P2003` después de crear la vinculación. Con una cuenta nueva se revirtieron la cuenta y la vinculación. Con una cuenta reutilizada se revirtió la vinculación nueva y se conservaron la cuenta y su vinculación previa en el otro gimnasio. |
| TypeScript | `tsc --noEmit --incremental false` aprobado. |
| Compilación | `npm run build` y `nest build negocios` aprobados. Se verificaron `dist/apps/gym-api/src/main.js` y `dist/libs/negocios/src/index.js`. |
| ESLint sin corrección automática | 387 errores y 78 advertencias antes y después. Cero diagnósticos nuevos al comparar por archivo, regla y mensaje. |

Las pruebas utilizaron bases desechables en PostgreSQL 17 local. Las
migraciones existentes se aplicaron exclusivamente al entorno de ensayo.
