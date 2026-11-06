# Informe de seguridad técnica compartida

Fecha: 2026-11-06. Estado: bloque implementado y verificado en desarrollo.

## 1. Resultado

El gimnasio consume su infraestructura técnica de autenticación desde
`@app/seguridad`. Se conservan los endpoints, los payloads de tokens, los campos
de `req.user`, los vencimientos y las políticas actuales del gimnasio.

La librería no tiene dependencias de Prisma ni de `gym-api`. No registra
proveedores globales ni contiene un módulo envolvente: cada aplicación conserva
su estrategia concreta y sus registros de Passport/JWT.

La extracción previa de Prisma y los cambios pendientes del repositorio se
tomaron como punto de partida. No se ejecutaron migraciones, seeds ni escrituras
en la base de datos; tampoco se modificó el frontend.

## 2. Distribución final

```text
BackendHero/
├── apps/gym-api/src/
│   ├── auth/
│   │   ├── auth.module.ts          Registra JWT con configuración compartida
│   │   ├── auth.service.ts         Login, selección y emisión de payloads Gym
│   │   ├── auth.types.ts           Contextos y GymJwtPayload
│   │   ├── guards/roles.guard.ts   Políticas de roles existentes
│   │   └── strategy/jwt.strategy.ts
│   │                               Adaptador Gym sobre JwtStrategyBase
│   ├── tenant/tenant-context.util.ts
│   │                               Solo fallback legacy de gym-principal
│   ├── notifications/              Gateway, salas y compatibilidad existentes
│   └── otros módulos/              Consumen guard y contexto compartidos
├── libs/
│   ├── prisma/                     Extracción anterior conservada
│   └── seguridad/
│       ├── tsconfig.lib.json
│       └── src/
│           ├── index.ts
│           ├── tenant/
│           │   ├── tenant-context.util.ts
│           │   └── tenant-context.util.spec.ts
│           └── jwt/
│               ├── jwt-auth.guard.ts
│               ├── jwt-strategy.base.ts
│               ├── jwt.config.ts
│               └── jwt.config.spec.ts
└── prisma/                         Esquema y migraciones sin cambios
```

Los controladores y su prueba de metadatos importan guard y helper desde la
entrada pública de la librería. La antigua definición local de `JwtAuthGuard`
y la copia local de `getTenantIdOrThrow()` se eliminaron.

## 3. Contratos compartidos y límites

| Exportación | Responsabilidad |
| --- | --- |
| `TenantAwareUser` | Tipo mínimo con `tenantId` opcional y nullable, conservando el contrato existente. |
| `getTenantIdOrThrow()` | Conversión numérica y validaciones actuales; mantiene el mensaje de error y la respuesta Unauthorized. |
| `JwtAuthGuard` | Utilizar la estrategia Passport llamada `jwt`. |
| `JwtStrategyBase<TPayload, TUser>` | Extraer Bearer y verificar firma y vencimiento, delegando el mapeo de payload a `validate()`. |
| `getJwtSecret()` | Resolver la variable de entorno con el fallback heredado al invocar la función, sin registrar ni almacenar secretos en caché. |
| `createJwtModuleOptions()` | Construir opciones JWT con opciones de firma propias del consumidor, sin imponer vencimiento cuando no se proporciona. |
| `ACCESS_TOKEN_EXPIRES_IN` | Un día para el acceso actual del gimnasio. |
| `CONTEXT_SELECTION_TOKEN_EXPIRES_IN` | Diez minutos para selección de contexto, manteniendo el override de la firma. |

Gym conserva la proyección de `sub`, `email`, `userName`, `cedula`, `rol`,
`clienteId`, `tenantId`, `tenantNombre`, `tenantRole` y `accessMode`. Los campos
opcionales ausentes mantienen el comportamiento anterior; la extracción no
añade claims obligatorios, filtros de tipo de token ni políticas de algoritmos.

`AuthService` mantiene sus casos de uso y sus respuestas. El guard de roles y
sus decoradores siguen en Gym, incluyendo equivalencias de OWNER, separación
de CLIENTE y compatibilidad de roles legacy. La administración de cuentas,
negocios y membresías del personal todavía no se ha extraído.

`resolveTenantIdOrDefault()` permanece en Gym y sigue consultando el slug
`gym-principal` cuando corresponde. La resolución de tenant de rutas protegidas
recibe `req.user`, no acepta el tenant de body/query ni aplica ese fallback.

En notificaciones se conservan el namespace `notifications`, el evento
`notificationsUpdate`, las salas `tenant:<id>`, los formatos de token y la
preferencia del tenant verificado. El fallback del handshake, incluido el caso
de fallo de verificación, conserva su comportamiento existente. Este bloque
no endurece ni amplía esas políticas.

## 4. Integración con compilación y ejecución

El workspace registra `seguridad` como librería y define `@app/seguridad` en
TypeScript y Jest unitario/e2e. Los comandos de lint, formato y cobertura
incluyen la nueva carpeta.

Se conserva el compilador TypeScript, la entrada de producción
`dist/apps/gym-api/src/main.js`, Docker y los nombres de los comandos de arranque.
`npx nest build seguridad` compila la librería de forma independiente sin borrar
el ejecutable del gimnasio. La librería no necesita un proceso propio.

## 5. Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias | 186 aprobadas en 43 suites; se conservan las 159 anteriores y se añaden 27 casos. |
| Integración HTTP/WebSocket | 17 aprobadas en dos suites; una arranca AppModule con PostgreSQL local y la otra utiliza proveedores de datos simulados. |
| Compilación de aplicación | `npm run build` correcto. |
| Compilación de seguridad | Compilación independiente de la librería correcta. |
| TypeScript sin emisión | Correcto con `--noEmit --incremental false`. |
| Ejecutable de producción | Arranque correcto con PostgreSQL local, 111 rutas registradas, ocho comprobaciones HTTP y entrega real de `notificationsUpdate`. |
| ESLint | 391 errores y 79 advertencias preexistentes; mismos hallazgos por archivo, regla y severidad. Sin diagnósticos en la nueva librería. |

Los casos añadidos cubren resolución y ausencia de tenant, conversión numérica,
secreto configurado y fallback, vencimientos reales de un día y diez minutos,
compatibilidad de firma con el emisor anterior, proyección de campos Gym,
fallback de `gym-principal` y caminos de compatibilidad del socket.

La integración también comprueba Bearer válido para ADMIN y OWNER, firma
incorrecta, vencimiento, ausencia de tenant autenticado, rechazo de CLIENTE en
rutas de personal y que un tenant enviado por query no sustituya al del JWT.

Las comprobaciones reales de base y producción utilizaron solo lecturas. No se
realizó una sesión manual completa del frontend ni un despliegue a producción.

## 6. Lista de seguimiento

### Bloque 2: seguridad técnica compartida

- [x] Extraer `getTenantIdOrThrow()` y su tipo de contexto autenticado.
- [x] Mantener en Gym el fallback específico de `gym-principal`.
- [x] Extraer el guard técnico de autenticación JWT.
- [x] Centralizar configuración JWT conservando vencimientos y comportamientos.
- [x] Separar verificación técnica y mapeo específico de Gym.

### Avance general

- [x] Base del monorepo y migración del gimnasio.
- [x] Librería Prisma.
- [x] Bloque completo de seguridad técnica compartida.
- [ ] Identidad compartida: cuenta, credenciales y operaciones comunes de Usuario.
- [ ] Administración común de negocios y membresías del personal.
- [ ] Roles y permisos nuevos, con transición explícita desde LEGACY.
- [ ] Catálogo compartido y adaptación de escrituras de inventario.
- [ ] Contratos y utilidades adicionales cuando haya consumidores concretos.
- [ ] Inventario común antes de utilizar LOTES desde ambos flujos.
- [ ] Activación e implementación de tienda-api.

Facturación, pagos, deudas, perfiles deportivos, entrenamientos, asistencia y
otros casos de uso del gimnasio conservan sus responsables actuales.
