# B02 · Clientes comerciales

`ClientesModule` exporta `ClientesService` para el mantenimiento de fichas y la
consulta de clientes activos en ventas. El vínculo opcional a Gym usa el
negocio de la ficha. Su desactivación conserva la ficha y el vínculo.

Para habilitar HTTP hacen falta el contexto y permiso de A02/A03 y el
adaptador A05 de auditoría. El llamador resuelve el tenant desde la sesión e
invoca la escritura de auditoría con la transacción que recibe del servicio.

Para verificar B02, aplicar las migraciones vigentes a una base PostgreSQL
de ensayo llamada `hero_tienda_clientes_test` en `127.0.0.1`, configurar
`DATABASE_URL` para esa base y ejecutar en PowerShell:

```powershell
$env:TIENDA_CLIENTES_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-clientes-postgres
```

Las pruebas incluyen clientes reales de Gym en PostgreSQL y una llamada de
auditoría de ensayo que permite comprobar la reversión ante un fallo.
