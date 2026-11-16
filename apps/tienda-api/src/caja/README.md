# B03 · Cajas y apertura de turno

`CajaModule` exporta `CajaService` para configurar cajas, consultar
disponibilidad y abrir turnos con fondo inicial. El cajero se obtiene
del contexto de sesión. La apertura usa K06 y registra la auditoría
en la misma transacción. `bloquearTurnoAbierto` es la primitiva que
comparten las operaciones que necesitan un turno activo.

Las rutas comerciales quedan pendientes del acceso y los permisos de
A02/A03, la auditoría de A05 y el selector de personal de A04.

Para probar B03, aplicar las migraciones vigentes a una base PostgreSQL
de ensayo llamada `hero_tienda_caja_test` en `127.0.0.1`, configurar
`DATABASE_URL` para esa base y ejecutar en PowerShell:

```powershell
$env:TIENDA_CAJA_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-caja-postgres
```
