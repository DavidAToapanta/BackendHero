# Autenticación de personal de Tienda

## Configuración local

Configura `DATABASE_URL` con la base de desarrollo migrada y genera Prisma
Client. Define `TIENDA_JWT_SECRET` en el entorno del proceso. Debe ser distinto
del `JWT_SECRET` efectivo de Gym, también si las APIs usan archivos de entorno
distintos. Tienda requiere su secreto para arrancar. El puerto por defecto es
`8081`.

```powershell
npm.cmd run start:dev -- tienda-api --env-file .env
```

## HTTP v1

`POST /auth/login` recibe `{"cedula":"00123","password":"clave-de-ensayo"}`.
Con una sola tienda elegible, devuelve `200` con el siguiente formato.

```json
{
  "requiresContextSelection": false,
  "accessToken": "<token-de-acceso>",
  "context": {
    "usuarioId": 17,
    "tenantId": 41,
    "tenantNombre": "Tienda Norte",
    "membresiaId": 29,
    "versionAutorizacion": 3,
    "modoAutorizacion": "LEGACY",
    "rolEfectivo": { "codigo": "ADMIN", "nombre": "ADMIN" }
  }
}
```

Con varias tiendas elegibles, devuelve `200` con las opciones de selección.

```json
{
  "requiresContextSelection": true,
  "selectionToken": "<token-de-seleccion>",
  "contexts": [
    { "tenantId": 41, "tenantNombre": "Tienda Norte" },
    { "tenantId": 42, "tenantNombre": "Tienda Sur" }
  ]
}
```

`POST /auth/select-context` recibe
`{"selectionToken":"<token-de-seleccion>","tenantId":42}`. Vuelve a comprobar
el acceso al negocio y devuelve `200` con `requiresContextSelection: false`,
`accessToken` y el `context` de la tienda elegida.

`GET /auth/session` recibe `Authorization: Bearer <token-de-acceso>` y devuelve
`200` con `{ "context": { ... } }`. La sesión usa únicamente el negocio del JWT
verificado y devuelve el contexto actual.

- `400` indica un cuerpo inválido o campos adicionales.
- `401` indica credenciales incorrectas, un token inválido, vencido o de otro
  tipo, o una sesión cuyo acceso ya no es válido.
- `403` indica que el usuario autenticado no tiene tiendas disponibles o que la
  tienda solicitada dejó de estar disponible para ese usuario.

Tienda firma con emisor `tienda-api`. La audiencia `tienda-api:selection`
autoriza la selección durante 10 minutos. La audiencia `tienda-api:access`
autoriza la sesión durante un día. Los tokens de Tienda y Gym se verifican con
claves distintas.

## Contrato K01 para A03 y módulos internos

Importar `AuthModule` desde `../auth` en el módulo consumidor y usar
`TiendaJwtGuard` y `ContextoTiendaActual` en las rutas protegidas.

```ts
import {
  ContextoTiendaActual,
  TiendaJwtGuard,
  type ContextoTienda,
} from '../auth';

// Dentro del controlador
@UseGuards(TiendaJwtGuard)
@Get('ejemplo')
consultar(@ContextoTiendaActual() context: ContextoTienda) {
  const { tenantId, membresiaId: responsableId } = context;
  return this.servicio.consultar(tenantId, responsableId);
}
```

`usuarioId` corresponde a `Usuario.id` y `membresiaId` a `UserTenant.id`.
Inventario y operaciones comerciales usan `membresiaId` como `responsableId`.
Auditoría recibe ambos IDs. El guard comprueba la membresía activa, el negocio
activo y `STORE` habilitado. En `LEGACY`, el rol efectivo refleja la membresía.
En `PERMISOS`, el rol efectivo proviene de la asignación activa. A03 debe
verificar el permiso exigido por cada ruta comercial.

## Pruebas

```powershell
npm.cmd test -- --runInBand apps/tienda-api/src/auth
npm.cmd run test:e2e -- --runInBand test/tienda-auth.e2e-spec.ts
```

Para la prueba con datos reales, crea una base local desechable llamada
`hero_tienda_auth_test` y configura `DATABASE_URL` con host `127.0.0.1` y los
datos de acceso locales. Ejecuta las migraciones en esa base antes de iniciar
la suite. La prueba crea sus propios usuarios y negocios con identificadores
únicos. Su operación se limita a esa base.

```powershell
$env:TIENDA_JWT_SECRET = 'secreto-local-solo-para-ensayo'
$env:TIENDA_AUTH_POSTGRES_E2E = '1'
npx.cmd prisma migrate deploy
npm.cmd run test:e2e -- --runInBand test/tienda-auth-postgres.e2e-spec.ts
```
