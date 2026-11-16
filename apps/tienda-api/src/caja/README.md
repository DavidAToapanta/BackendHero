# B03 y B04 · Caja

Las rutas usan el token de Tienda. El turno se abre para la membresía de la
sesión y los montos se envían como cadenas decimales. Las cajas se desactivan
cuando ya terminó su turno. El selector de personal está en
[`GET /accesos/personal`](../accesos/README.md#personal-y-roles).

| Ruta | Permiso | Solicitud o resultado |
| --- | --- | --- |
| `GET /caja` | `store.cash.read` | Lista de cajas y disponibilidad. Admite `disponibles=true`. |
| `GET /caja/:id` | `store.cash.read` | Datos de la caja. |
| `POST /caja` | `store.cash.manage` | `{ codigo, nombre, activo? }`. |
| `PATCH /caja/:id` | `store.cash.manage` | Cambia los campos enviados. |
| `DELETE /caja/:id` | `store.cash.manage` | Desactiva la caja. |
| `POST /caja/:id/turnos` | `store.cash.open` | `{ fondoInicial }`. |
| `GET /caja/:id/turno-activo` | `store.cash.read` | Turno abierto, o `404` si no hay uno. |
| `GET /caja/turnos/:id` | `store.cash.read` | Detalle del turno. |
| `GET /caja/turnos/:id/movimientos` | `store.cash.read` | Movimientos con `pagina` y `limite` opcionales. |
| `POST /caja/turnos/:id/movimientos` | `store.cash.movements.write` | `{ monto, direccion, motivo }` en el turno propio. |
| `POST /caja/turnos/:id/cierre` | `store.cash.close` | `{ efectivoContado, motivo? }`. |

Para consultar o cerrar el turno de otro cajero se requiere además
`store.cash.manage`. Abrir, mover efectivo y cerrar requieren el encabezado
`Idempotency-Key` y devuelven `{ recursoTipo, recursoId }`. El cierre
conserva el saldo esperado calculado con el fondo inicial y los movimientos
de efectivo. Las escrituras guardan auditoría con el actor y la transacción.

`CajaModule` exporta `CajaService`. Los coordinadores de cobros, gastos y
reembolsos pasan el mismo `tx` y la referencia del origen a
`registrarMovimiento`. Para operaciones que requieren un turno abierto,
usan `bloquearTurnoAbierto`.

Para correr la prueba del servicio, aplicar las migraciones a
`hero_tienda_caja_test` en PostgreSQL local y apuntar `DATABASE_URL` a esa
base de ensayo. En PowerShell:

```powershell
$env:TIENDA_JWT_SECRET = 'clave-de-tienda-solo-para-ensayo'
$env:TIENDA_CAJA_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-caja-postgres
```

El [flujo HTTP con permisos y auditoría](../../../../test/tienda-auth-postgres.e2e-spec.ts)
se ejecuta con la suite descrita en [autenticación](../auth/README.md).
