# B02 · Clientes comerciales

`ClientesModule` exporta `ClientesService` para el mantenimiento de fichas y la
consulta de clientes activos en ventas. El vínculo opcional a Gym usa el
negocio de la ficha. Su desactivación conserva la ficha y el vínculo.

Las rutas usan el token de Tienda y el negocio de la sesión.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `GET /clientes` | `store.customers.read` | Lista con filtros opcionales `q`, `activo`, `pagina` y `limite`. |
| `GET /clientes/:id` | `store.customers.read` | Detalle de la ficha. |
| `POST /clientes` | `store.customers.write` | Alta. Requiere `nombres` y admite apellidos, razón social, identificación, contacto y `clienteGymId`. |
| `PATCH /clientes/:id` | `store.customers.write` | Edición de los campos enviados. `null` elimina los valores opcionales. |
| `DELETE /clientes/:id` | `store.customers.write` | Desactiva la ficha y devuelve su estado. |

La lista devuelve un arreglo, con página inicial 1 y 25 resultados por
defecto. `activo` acepta `true` o `false`. Las escrituras usan
`AuditoriaEscrituraService.paraOperacion` y guardan el evento en la
transacción de Clientes. [Contrato de auditoría K04](../auditoria/README.md).

Para verificar B02, aplicar las migraciones vigentes a una base PostgreSQL
de ensayo llamada `hero_tienda_clientes_test` en `127.0.0.1`, configurar
`DATABASE_URL` para esa base y ejecutar en PowerShell:

```powershell
$env:TIENDA_JWT_SECRET = 'clave-de-tienda-solo-para-ensayo'
$env:TIENDA_CLIENTES_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-clientes-postgres
```

Las pruebas incluyen clientes reales de Gym, los eventos persistidos de B02
y la reversión de la ficha y su auditoría cuando falla la transacción.
La [suite HTTP de Tienda](../../../../test/tienda-auth-postgres.e2e-spec.ts)
comprueba el flujo con JWT reales y permisos de distintos negocios.
