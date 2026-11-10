# Informe del punto 3 · Identidad compartida

**Punto 3 terminado.** Gym usa `@app/identidad` para verificar
credenciales, buscar cuentas por ID, detectar duplicados y crear cuentas de
`Usuario`. El cambio conserva las rutas, las respuestas, los mensajes de error
y los campos y vencimientos de los tokens que utiliza el frontend.

## Responsabilidades

- **Identidad** consulta `Usuario` mediante `@app/prisma`. Distingue una
  cuenta inexistente de una contraseña incorrecta, devuelve coincidencias
  independientes por cédula, correo y nombre de usuario, y crea cuentas en la
  transacción del consumidor. Usa bcrypt con costo 10 y sus operaciones nunca
  devuelven el hash.
- **Gym** conserva la normalización de las entradas, la precedencia y los
  mensajes de duplicados, y las decisiones sobre reutilización, roles,
  permisos de contexto y perfiles. La edición y las consultas con perfiles
  siguen en Gym. Si Cliente o Staff reutilizan una cuenta, conservan sus datos
  y su contraseña.
- El cálculo del hash se ejecuta dentro de la transacción de alta en los cuatro
  flujos. Antes, propietario y usuario legacy lo calculaban antes de abrirla.
  El esquema y las migraciones existentes se mantuvieron.

## Flujos HTTP

| Endpoint | Recorrido |
| --- | --- |
| `POST /auth/login` | `AuthController` recibe el DTO. `AuthService` normaliza las credenciales y llama a `IdentidadService.verifyCredentials`. Prisma lee `Usuario` en PostgreSQL e Identidad compara la contraseña. Gym consulta clientes y vinculaciones activas y emite un JWT de un día para un contexto único, o devuelve los contextos con un token de selección de diez minutos. |
| `POST /auth/select-context` | `AuthController` entrega el DTO a `AuthService`. Gym verifica el token de selección. `IdentidadService.findById` consulta `Usuario` por el ID del token. Gym vuelve a consultar los contextos disponibles, valida el acceso y emite el JWT del contexto elegido. |
| `POST /auth/register-owner` | `AuthController` entrega el DTO a `AuthService`. Gym normaliza los datos y aplica sus reglas de duplicados y slug. Dentro de una única transacción, `IdentidadService.createAccount` inserta `Usuario` y Gym inserta `Tenant`, `UserTenant` con rol `OWNER` y el `TenantModule` de Gym. Tras confirmar la transacción, Gym ejecuta el login automático. |

Cuando exista `tienda-api`, su módulo de autenticación podrá importar
`IdentidadModule` e inyectar `IdentidadService`. Así accederá a las mismas
cuentas de PostgreSQL desde su proceso. Tienda resolverá sus contextos y roles y
emitirá sus tokens según sus propias reglas.

## Archivos creados

| Archivo | Responsabilidad |
| --- | --- |
| `libs/identidad/src/identidad.module.ts` | Registra y exporta el servicio Nest sobre `PrismaModule`. |
| `libs/identidad/src/identidad.service.ts` | Consultas de cuenta, verificación de credenciales, coincidencias y alta transaccional. |
| `libs/identidad/src/index.ts` | Entrada pública de `@app/identidad`. |
| `libs/identidad/src/identidad.service.spec.ts` | Pruebas de credenciales, coincidencias, bcrypt y proyección sin hash. |
| `libs/identidad/tsconfig.lib.json` | Compilación independiente de la librería. |
| `test/identidad-postgres.e2e-spec.ts` | Contratos HTTP de autenticación y reversión ante un fallo real en PostgreSQL. |
| `docs/INFORME_IDENTIDAD_COMPARTIDA.md` | Flujos, inventario de archivos y resultados de verificación. |

## Archivos modificados

| Archivo | Responsabilidad del cambio |
| --- | --- |
| `apps/gym-api/src/auth/auth.module.ts` | Importa `IdentidadModule` para autenticación. |
| `apps/gym-api/src/auth/auth.service.ts` | Delega las operaciones de cuenta del login, selección y alta de propietario. |
| `apps/gym-api/src/auth/auth.service.spec.ts` | Ejecuta los casos existentes con el servicio real de Identidad y Prisma simulado. |
| `apps/gym-api/src/usuarios/usuarios.module.ts` | Importa `IdentidadModule` para el alta legacy. |
| `apps/gym-api/src/usuarios/usuarios.service.ts` | Delega duplicados y creación de la cuenta en el alta legacy. |
| `apps/gym-api/src/usuarios/usuarios.service.spec.ts` | Actualiza los datos simulados y verifica la respuesta del alta sin contraseña. |
| `apps/gym-api/src/cliente/cliente.module.ts` | Importa `IdentidadModule` para el registro de clientes. |
| `apps/gym-api/src/cliente/cliente.service.ts` | Usa Identidad para buscar coincidencias y crear la cuenta cuando corresponde. |
| `apps/gym-api/src/cliente/cliente.service.spec.ts` | Verifica reutilización y rechazos cuando los identificadores apuntan a cuentas distintas. |
| `apps/gym-api/src/staff/staff.module.ts` | Importa `IdentidadModule` para las altas de personal. |
| `apps/gym-api/src/staff/staff.service.ts` | Delega coincidencias y creación de la cuenta y conserva la vinculación y los perfiles. |
| `apps/gym-api/src/staff/staff.service.spec.ts` | Ejecuta los casos de creación y reutilización de cuentas con Identidad. |
| `nest-cli.json` | Registra el proyecto `identidad`. |
| `tsconfig.json` | Resuelve el alias `@app/identidad`. |
| `package.json` | Incluye Identidad en Jest unitario, cobertura, lint y formato. |
| `test/jest-e2e.json` | Resuelve el alias en las pruebas e2e. |
| `docs/ARQUITECTURA_BACKEND.md` | Describe la librería y la distribución de responsabilidades. |
| `libs/README.md` | Incorpora Identidad al índice de librerías. |

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 205 pruebas aprobadas en 45 suites. |
| `npm run test:e2e -- --runInBand` con `IDENTIDAD_POSTGRES_E2E=1` | 19 pruebas aprobadas en 3 suites. Incluye la raíz con PostgreSQL, compatibilidad HTTP/WebSocket y los dos casos de Identidad. Las 7 pruebas optativas de inventario y migración Store quedaron desactivadas. |
| Reversión del alta de propietario | La prueba comprobó que `Usuario` y `Tenant` existían dentro de la transacción. PostgreSQL rechazó la inserción en `UserTenant` por `UserTenant_usuarioId_fkey` (Prisma `P2003`). Tras el HTTP 500, ambas búsquedas fuera de la transacción devolvieron `null`. |
| `tsc --noEmit --incremental false` | Aprobado. |
| `npm run build` y `nest build identidad` | Aprobados. Se verificaron `dist/apps/gym-api/src/main.js` y `dist/libs/identidad/src/index.js`. |
| ESLint sin `--fix` | 387 errores y 78 advertencias antes y después. La comparación por archivo, regla y mensaje detectó cero hallazgos nuevos. |

Se usó PostgreSQL 17 local con la base desechable `hero_identidad_test`. Sus
tres migraciones se aplicaron únicamente para preparar el ensayo.
