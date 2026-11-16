# B02 · Clientes comerciales

`ClientesModule` exporta `ClientesService` para el mantenimiento de fichas y la
consulta de clientes activos en ventas. El vínculo opcional a Gym usa el
negocio de la ficha. Su desactivación conserva la ficha y el vínculo.

Para habilitar HTTP, resolver el contexto y el permiso mediante A02/A03.
Usar `AuditoriaEscrituraService.paraOperacion(contexto, correlacionId)` para
pasar el contexto comercial al servicio. El adaptador A05 usa la transacción
que recibe de Clientes. [Contrato de auditoría K04](../auditoria/README.md).

Para verificar B02, aplicar las migraciones vigentes a una base PostgreSQL
de ensayo llamada `hero_tienda_clientes_test` en `127.0.0.1`, configurar
`DATABASE_URL` para esa base y ejecutar en PowerShell:

```powershell
$env:TIENDA_CLIENTES_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-clientes-postgres
```

Las pruebas incluyen clientes reales de Gym, los eventos persistidos de B02
y la reversión de la ficha y su auditoría cuando falla la transacción.
