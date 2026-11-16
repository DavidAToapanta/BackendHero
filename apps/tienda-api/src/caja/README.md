# B03 y B04 · Caja

`CajaModule` exporta `CajaService` para configurar cajas, consultar
disponibilidad y abrir turnos con fondo inicial. El cajero se obtiene
del contexto de sesión. La apertura usa K06 y registra la auditoría
en la misma transacción. `bloquearTurnoAbierto` es la primitiva que
comparten las operaciones que necesitan un turno activo.

B04 incorpora `moverEfectivo`, `registrarMovimiento`, `listarMovimientos`
y `cerrarTurno`. El cierre bloquea el turno y registra el efectivo
esperado como fondo inicial más entradas menos salidas. Un cobro por
transferencia queda fuera de ese saldo. Los movimientos y el cierre
usan claves idempotentes en sus operaciones de entrada.

Las operaciones de cobro, reembolso y gasto pasan el mismo `tx` a
`registrarMovimiento` y su referencia de origen. Un cierre supervisado
requiere que el llamador haya comprobado el permiso administrativo.

Las rutas comerciales quedan pendientes del acceso y los permisos de
A02/A03, la auditoría de A05 y el selector de personal de A04.

Para probar B03 y B04, aplicar las migraciones vigentes a una base PostgreSQL
de ensayo llamada `hero_tienda_caja_test` en `127.0.0.1`, configurar
`DATABASE_URL` para esa base y ejecutar en PowerShell:

```powershell
$env:TIENDA_CAJA_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-caja-postgres
```
