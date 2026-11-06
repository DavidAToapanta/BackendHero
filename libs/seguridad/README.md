# Seguridad técnica compartida

Librería importable desde `@app/seguridad`, sin dependencias de Prisma ni de las
aplicaciones. No arranca servicios ni registra proveedores globales.

## Entrada pública

| Exportación | Responsabilidad |
| --- | --- |
| `TenantAwareUser` | Tipo mínimo del contexto autenticado con tenant opcional. |
| `getTenantIdOrThrow()` | Resolver el tenant desde ese contexto y conservar el error existente si no se puede resolver. |
| `JwtAuthGuard` | Aplicar la estrategia Passport `jwt`. |
| `JwtStrategyBase<TPayload, TUser>` | Extraer Bearer y verificar firma y vencimiento; delegar `validate()` en la aplicación. |
| `getJwtSecret()` | Resolver `JWT_SECRET` con el fallback heredado, sin almacenarlo en caché. |
| `createJwtModuleOptions()` | Construir opciones JWT con opciones de firma específicas del consumidor. |
| `ACCESS_TOKEN_EXPIRES_IN` | Vencimiento actual de acceso: un día. |
| `CONTEXT_SELECTION_TOKEN_EXPIRES_IN` | Vencimiento actual de selección de contexto: diez minutos. |

Cada aplicación registra su propia estrategia concreta y sus módulos JWT. En
Gym, `JwtStrategy` hereda de la base y conserva el mapeo de los campos existentes
de `req.user`. Autenticación configura el vencimiento de acceso y conserva el
override de selección; notificaciones utiliza la misma fábrica sin añadir un
vencimiento de firma por defecto.

## Límites conservados

`AuthService`, selección de contexto, roles, registro de propietarios y políticas
del gimnasio permanecen en `gym-api`. También el fallback de `gym-principal`,
las salas WebSocket y la compatibilidad del handshake. Esta extracción no
implementa identidad compartida, administración de negocios ni permisos nuevos.

`getTenantIdOrThrow()` debe recibir el contexto autenticado; no sustituye la
verificación de tokens ni autoriza a confiar en un tenant enviado en body/query.
Se conservan su conversión numérica y validaciones actuales.

## Compilación y pruebas

Los comandos de la raíz incluyen esta librería. `npx nest build seguridad`
permite compilarla por separado sin borrar otros artefactos de `dist/`.
La aplicación conserva `dist/apps/gym-api/src/main.js` como entrada de producción.

Las pruebas comprueban resolución de tenant, configuración y vencimientos JWT.
La integración del guard y de la estrategia se verifica también desde Gym con
tokens válidos, inválidos y vencidos, además de WebSocket.

El informe del bloque está en
[INFORME_SEGURIDAD_COMPARTIDA.md](../../docs/INFORME_SEGURIDAD_COMPARTIDA.md).
