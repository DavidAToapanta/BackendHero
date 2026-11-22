# Autenticación de personal de Tienda

## Configuración local

Configura `DATABASE_URL` con la base de desarrollo migrada y genera Prisma
Client. Define `TIENDA_JWT_SECRET` en el entorno del proceso. Debe ser distinto
del `JWT_SECRET` efectivo de Gym, también si las APIs usan archivos de entorno
distintos. Tienda requiere su secreto para arrancar. El puerto por defecto es
`8081`.

```powershell
npm.cmd run start:dev:tienda
```

Este comando carga el `.env` de la raíz. Agrega allí `DATABASE_URL` y
`TIENDA_JWT_SECRET`; Nest no carga ese archivo automáticamente al usar
`npm run start:dev -- tienda-api` sin `--env-file .env`.

## HTTP v1

### Registrar propietario y tienda

`POST http://localhost:8081/auth/register-owner` recibe `Content-Type:
application/json`. La ruta es pública y no requiere token de Gym ni de Tienda.

```json
{
  "cedula": "0503791022",
  "password": "<contraseña>",
  "nombres": "Juan",
  "apellidos": "Pérez",
  "email": "juan@example.com",
  "tenantNombre": "Mi Tienda",
  "tenantSlug": "mi-tienda",
  "telefono": "0991234567",
  "direccion": "Dirección de la tienda",
  "ciudad": "Latacunga",
  "pais": "Ecuador"
}
```

`tenantSlug`, `telefono`, `direccion`, `ciudad` y `pais` son opcionales. Si se
omite el slug, se deriva del nombre de la tienda. El slug se normaliza a letras
ASCII minúsculas, números y guiones y debe ser único. La cédula se envía como
cadena para conservar sus ceros iniciales. El correo identifica a la cuenta.

Una cuenta nueva se crea con su contraseña hasheada. La contraseña nueva debe
tener entre 6 y 72 bytes UTF-8. Si la cédula ya existe, se verifica su contraseña
y se conserva su perfil, credenciales y membresías. Los nombres y apellidos
enviados se ignoran en ese caso. El correo se compara sin distinguir mayúsculas.
Si la cuenta tiene correo, debe coincidir. Si carece de correo, puede enviarse
uno libre y el registro no lo guarda en la cuenta.

La respuesta `201 Created` siempre contiene acceso directo a la tienda recién
creada, aunque la cuenta ya sea propietaria de otras tiendas.

```json
{
  "requiresContextSelection": false,
  "accessToken": "<JWT de Tienda>",
  "context": {
    "usuarioId": 17,
    "tenantId": 42,
    "tenantNombre": "Mi Tienda",
    "membresiaId": 31,
    "versionAutorizacion": 3,
    "modoAutorizacion": "PERMISOS",
    "rolEfectivo": { "codigo": "OWNER", "nombre": "OWNER" }
  }
}
```

La tienda queda activa con `STORE`, los roles iniciales y su propietario
habilitados. Usa el `accessToken` como `Authorization: Bearer <token>` para
consultar `GET /auth/session` o `GET /catalogo/categorias`. Una sesión queda
asociada a su tienda. Para entrar a otra, usa `POST /auth/login` y selecciona
el contexto si se muestran varias opciones.

- `400` indica datos inválidos o campos adicionales, como `ownerUserId`,
  `tenantId`, `roles` o `permisos`.
- `401` indica que la contraseña de la cuenta existente es incorrecta.
- `409` indica un conflicto de correo, slug o registro concurrente. Si el
  mensaje solicita reintentar, envía de nuevo la solicitud.
- `500` indica un fallo inesperado. La cuenta nueva, tienda, membresía y
  configuración inicial se guardan en conjunto, o la operación se revierte.

### Iniciar sesión

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
verificado y devuelve el contexto actual con `permisos` efectivos de Tienda y
`esPropietario` para presentar el menú.

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
