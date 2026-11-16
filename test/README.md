# A13 · Datos de ensayo y regresiones compartidas

Las suites generan sus propios registros en PostgreSQL. Los IDs y las claves
se asignan en cada ejecución. Los resultados se comprueban contra cantidades,
importes y permisos conocidos. Usar bases locales desechables con codificación
UTF-8. Las suites comprueban el nombre de la base y el host `127.0.0.1` antes
de crear datos.

## Ejecutar desde la raíz

Con PostgreSQL local en ejecución, crear las bases `hero_tienda_auth_test` y
`hero_inventario_test`. En estos ejemplos el servidor escucha en `55432`.
Reemplazar el puerto y las credenciales por los del PostgreSQL de ensayo.

```powershell
createdb -h 127.0.0.1 -p 55432 -U postgres -E UTF8 --locale=C -T template0 hero_tienda_auth_test
createdb -h 127.0.0.1 -p 55432 -U postgres -E UTF8 --locale=C -T template0 hero_inventario_test

$env:DATABASE_URL = 'postgresql://postgres:clave@127.0.0.1:55432/hero_tienda_auth_test'
$env:TIENDA_JWT_SECRET = 'solo-ensayo-tienda'
$env:TIENDA_AUTH_POSTGRES_E2E = '1'
npx.cmd prisma migrate deploy
npm.cmd run test:e2e -- --runInBand tienda-auth-postgres tienda-auth.e2e-spec

$env:DATABASE_URL = 'postgresql://postgres:clave@127.0.0.1:55432/hero_inventario_test'
$env:INVENTARIO_POSTGRES_E2E = '1'
npx.cmd prisma migrate deploy
npm.cmd run test:e2e -- --runInBand inventario-postgres

npm.cmd run test:e2e:gym -- --runInBand
npm.cmd test -- --runInBand
npm.cmd run build -- gym-api
npm.cmd run build -- tienda-api
npx.cmd eslint test/fixtures/tienda.ts test/tienda-auth-postgres.e2e-spec.ts test/inventario-postgres.e2e-spec.ts --max-warnings 0
```

## Casos disponibles

- **Aislamiento de tiendas.** Dos tiendas en modo `PERMISOS` tienen el mismo
  SKU y código de caja, sus propios clientes, y membresías con permisos
  efectivos. Cada producto empieza con 4 unidades vigentes, 2 vencidas y
  una unidad dada de baja que deja su lote agotado. Tras reservar 2 unidades
  vigentes se esperan 6 físicas, 2 reservadas y 2 disponibles. Leer y editar
  productos, cajas o clientes ajenos devuelve `404`. Registrar una baja con
  un lote ajeno devuelve `404`, incluso si el producto de la ruta es propio.
  Se comparan los datos de la segunda tienda antes y después de los intentos.
  [Prueba HTTP de Tienda](./tienda-auth-postgres.e2e-spec.ts)
- **Revocación y negocio MIXTO.** Tras editar las autorizaciones, la sesión
  anterior devuelve `401` y una sesión nueva sin el permiso devuelve `403`.
  En un negocio con `GYM` y `STORE`, desactivar `STORE` invalida el acceso de
  Tienda mientras la consulta autenticada de productos de Gym sigue en `200`.
  [Pruebas de permisos y módulos](./tienda-auth-postgres.e2e-spec.ts)
- **Reservas y saldo.** Un pedido confirmado reserva sus unidades usando el
  mismo fixture en Tienda e Inventario. La salida que consume esa existencia
  se rechaza hasta cancelar el pedido. También se comprueba que la venta y
  la baja concurrentes dejan una sola salida por la última unidad.
  [Fixture de reserva](./fixtures/tienda.ts) · [Pruebas de inventario](./inventario-postgres.e2e-spec.ts)
- **Compatibilidad de Gym.** La suite HTTP/WebSocket cubre autenticación,
  aislamiento de notificaciones y acceso HTTP. La suite de inventario con
  PostgreSQL usa el servicio real de compras de Gym en `LEGACY` y `LOTES`.
  [Regresión de Gym](./gym-api.e2e-spec.ts) · [Pruebas de inventario](./inventario-postgres.e2e-spec.ts)

## Escenario de contado para A13 y B17

Usar una tienda de ensayo con un lote de **3 unidades aptas**, costo por
unidad `1.0000`, precio `5.20` y fondo de caja `5.00`. La deuda esperada es
`0.00` en todos los pasos.

1. **Venta B06.** Cobrar `15.60` en efectivo. Quedan 0 unidades disponibles,
   caja `20.60` y pérdida `0.0000`. La suite de Tienda verifica este estado
   después de vender 3 unidades disponibles, en un producto que también
   tiene existencias no vendibles por vencimiento o reserva.
2. **Devolución apta B10.** Reintegrar 1 unidad y reembolsar `5.20` en
   efectivo. Repetir con la misma clave y comprobar que devuelve la misma
   referencia. Queda 1 unidad disponible, caja `15.40` y pérdida `0.0000`.
3. **Devolución dañada B10.** Devolver otra unidad como `BAJA_NO_APTO` y
   reembolsar `5.20` usando la aplicación de cobro vigente. Queda 1 unidad
   disponible, caja `10.20` y pérdida `1.0000`.
4. **Anulación B11.** Con el turno abierto, reintegrar únicamente la tercera
   unidad y reembolsar los `5.20` restantes. La venta queda `ANULADA`, el
   stock disponible queda en 2 unidades, la caja en `5.00` y la pérdida en
   `1.0000`. Cerrar caja solo después de comprobar esos valores.
5. **Conciliación B15.** Comparar el indicador con `consultarTotalPerdidas`
   de Inventario para el mismo tenant y rango `[desde, hasta)`. El periodo
   que incluye la baja da `1.0000`. Si `hasta` es la fecha exacta de la
   baja, el resultado de este escenario es `0.0000`.

Al publicarse `codex/voncho-b10-devoluciones` con `ff8f53a`, usar sus
migraciones sobre una base `hero_tienda_auth_test` desechable, con las
variables de Tienda indicadas arriba. Ejecutar:

```powershell
npm.cmd run test:e2e -- --runInBand tienda-auth-postgres -t 'vende en mostrador y devuelve mercancía apta y dañada con reembolso'
```

Ese caso valida las dos devoluciones con A11 real y cierra la caja en
`10.20`. El escenario combinado conserva el turno abierto hasta B11 y usa
el indicador real de B15 una vez integrado.

## Resultado de verificación de A13

La ejecución usó `dev2` en `d34ab6d` con los cambios de prueba de A13. Pasaron
234 pruebas unitarias, 11 de Inventario con PostgreSQL, 21 de Tienda entre
la suite PostgreSQL y la suite de autenticación, y 16 de Gym HTTP/WebSocket.
También pasaron el lint de los archivos de prueba modificados y la
compilación de `gym-api` y `tienda-api`.

Queda ejecutar B10 desde la rama publicada, continuar el mismo escenario
con B11 y contrastar el indicador real de B15 con los valores de esta guía.
