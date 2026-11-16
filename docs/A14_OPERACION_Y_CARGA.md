# A14 · Operación y carga de Gym y Tienda

## Arranque y reinicio

Con Node, generar Prisma y compilar las APIs por separado desde la raíz.

```powershell
npm.cmd ci
npx.cmd prisma generate
npm.cmd run build:gym
npm.cmd run build:tienda
```

Ejecutar `npx.cmd prisma migrate deploy` una vez contra la base compartida
antes de arrancar los servicios. En dos terminales, configurar `DATABASE_URL`
para cada proceso y ejecutar `npm.cmd run start:prod` para Gym o
`npm.cmd run start:prod:tienda` para Tienda. Gym usa `PORT=8080` por defecto y
Tienda `PORT=8081`. Tienda exige `TIENDA_JWT_SECRET` distinto del `JWT_SECRET`
efectivo de Gym. Usar el mismo secreto de Gym entre sus réplicas.

Con Docker, `compose.apis.yml` define ambos servicios. Configurar
`GYM_DATABASE_URL` y `TIENDA_DATABASE_URL` con el PostgreSQL accesible desde
los contenedores. Por ejemplo, si se usa también `docker-compose.yml`, el
host de la base de desarrollo en ambas URLs es `postgres-dev:5432`. Pasar las
variables desde el entorno de ejecución. Los puertos publicados quedan en
loopback, y `GYM_HOST_PORT` y `TIENDA_HOST_PORT` permiten cambiarlos.

```powershell
docker compose -f docker-compose.yml -f compose.apis.yml up -d postgres-dev
docker compose -f docker-compose.yml -f compose.apis.yml build
docker compose -f docker-compose.yml -f compose.apis.yml run --rm tienda-api ./node_modules/.bin/prisma migrate deploy
docker compose -f docker-compose.yml -f compose.apis.yml up -d --wait gym-api tienda-api
docker compose -f docker-compose.yml -f compose.apis.yml restart tienda-api
```

`GET /health/live` comprueba el proceso. `GET /health/ready` abre una
transacción de prueba con hasta 1 s para adquirirla y otro segundo para
ejecutarla. Devuelve `503` si no puede usar PostgreSQL. Para recuperar una API,
mirar sus logs, comprobar la base y reiniciar solo el servicio afectado.
Con Docker, el cierre envía `SIGTERM` y Prisma desconecta al apagar Nest.
El balanceador debe retirar una réplica que no esté lista. Si cae la base,
ambos procesos pueden seguir vivos con readiness en `503` hasta que se
restablezca PostgreSQL. Confirmar ambas URLs antes de reanudar la carga.
Los módulos de Tienda siguen compartiendo el proceso de Tienda.

## Conexiones y diagnóstico

Para el ensayo, arrancar una réplica de cada API con estos parámetros en
su `DATABASE_URL`:

```
Gym:    ?connection_limit=5&pool_timeout=5&application_name=a14-gym
Tienda: ?connection_limit=5&pool_timeout=5&application_name=a14-tienda
```

El ensayo reserva diez conexiones para APIs y una para el observador. Para el
piloto, calcular `réplicas máximas Gym × límite Gym + réplicas máximas Tienda ×
límite Tienda`, incluyendo el solapamiento de réplicas. La suma debe caber en
`max_connections` menos conexiones reservadas por PostgreSQL, administración,
procesos de migración y otras aplicaciones. Los límites de cada proceso son
techos de pool. Antes del piloto hay que obtener la capacidad y las reservas
reales del administrador de la base.

```sql
SHOW max_connections;
SHOW superuser_reserved_connections;
SELECT application_name, wait_event_type, wait_event,
       cardinality(pg_blocking_pids(pid)) AS bloqueadores
FROM pg_stat_activity
WHERE datname = current_database();
```

- Cada solicitud devuelve `X-Request-Id`. Los logs JSON incluyen ese ID, método,
  patrón de ruta, duración y estado HTTP, o marcan la salida como abortada.
  Conservar el ID del cliente para buscar la solicitud en los logs. El UUID
  de auditoría de la operación comercial sigue teniendo su propio contrato.
- Con `PRISMA_POOL_LOG=1`, Prisma 6.10.1 emite cada 5 s el estado del pool y sus
  histogramas acumulados. Comparar los incrementos del histograma de espera
  durante la ventana y revisar los gauges de conexiones ocupadas y ociosas.
  El observador de carga registra eventos de espera y si hay bloqueadores en
  `pg_stat_activity`, agrupados por `application_name`.
- Si aumentan las esperas del pool con las conexiones ocupadas y sin
  bloqueadores observados, revisar duración de consultas y capacidad antes
  de subir el límite. Si aparecen bloqueos, identificar la transacción que
  retiene los locks y reducir su alcance o duración. Las muestras cada 5 s
  pueden omitir esperas breves. Una consulta de contención comprueba la
  corrección del stock por separado.

## Corridas reproducibles

El banco usa una base local desechable `hero_a14_test` y APIs en `127.0.0.1`.
Cambiar `A14_TIENDA_URL` o `A14_GYM_URL` si se usan otros puertos. Aplicar las
migraciones, dejar ambas APIs listas y, desde otra terminal, usar:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:clave@127.0.0.1:55432/hero_a14_test'
node test/carga/a14.mjs preparar
node test/carga/a14.mjs historial
```

`preparar` crea 3 tiendas, 2 cajas por tienda, productos de 2 artículos por
venta, un lote de una unidad para contención y una cuenta de Gym. `historial`
añade por tienda 10.000 ventas dentro de 30 días, 1.000 de ellas en los últimos
7 días. Crea lotes, cierres, efectivo y transferencias, además de un crédito
con abono y devolución dañada, una baja, un gasto y una venta anulada sin
retorno físico. `A14_HASTA` fija el límite exclusivo del periodo, que por
defecto es el inicio del día en `America/Guayaquil`. La variable
`A14_HISTORIAL_FILAS` permite validar primero una cantidad reducida. El archivo
`.tmp/a14-esperados.json` conserva los totales del historial por tienda y rango.
La prueba funcional de devoluciones con reembolso se reproduce con los
[datos de A13](../test/README.md).

Guardar un respaldo de la base preparada antes de medir. Para cada corrida,
detener ambas APIs, restaurar el respaldo en una base desechable vacía con el
mismo nombre, y volver a arrancarlas. Conservar `.tmp/a14-datos.json` y
`.tmp/a14-esperados.json` para que todos los intentos usen el mismo escenario.
El banco escribe un informe JSON por modo y factor en `.tmp/`.

```powershell
# DATABASE_URL para estas herramientas no incluye parámetros del pool Prisma.
pg_dump --format=custom --file=.tmp/a14-preparado.dump --dbname=$env:DATABASE_URL
# Con ambas APIs detenidas y la base desechable recreada y vacía.
pg_restore --exit-on-error --no-owner --dbname=$env:DATABASE_URL .tmp/a14-preparado.dump
```

```powershell
node test/carga/a14.mjs base
# Restaurar antes de la siguiente corrida.
$env:A14_FACTOR = '1.5'
node test/carga/a14.mjs base
Remove-Item Env:A14_FACTOR
```

La corrida usa 60 s de calentamiento y cinco minutos de medición por defecto.
Envía 30 ventas, 60 consultas de inventario y 30 lecturas Gym por minuto, con
un WebSocket autenticado. Realiza un cierre y reapertura por caja, y prueba
dos ventas simultáneas por la última unidad fuera de la medición. Usa p95 de
rango más cercano sobre solicitudes exitosas y cuenta intentos, fallos técnicos,
rechazos esperados y errores de conciliación. Los cierres y las descargas se
informan con su número de muestras.

Los límites de p95 son 800 ms para venta, 400 ms para inventario, 1,5 s para
cierre, 2 s para finanzas y 5 s o 20 s para descarga típica o grande. Cada
operación admite hasta 0,5 % de errores técnicos (`5xx`, timeout o fallo de
conexión). Las comprobaciones de stock, deuda, caja y aislamiento deben pasar.

### Finanzas y exportaciones

Con el SHA integrado, usar `A14_CONTRATO` con la ruta de un módulo `.mjs`
que exporte por defecto las funciones `finanzas(tenantId)`,
`excel(tenantId, tamano)` y `pdf(tenantId, tamano)`. Deben devolver rutas HTTP
locales verificadas para `tipico` y `grande`, con los periodos y filtros
correspondientes. Implementar `validarReporte({ tenantId, json })` y
`validarArchivo({ tenantId, modo, tamano, bytes })` para abrir los formatos
reales, verificar filas y conciliar los totales del periodo con el archivo
de esperados. Para esta comparación, las exportaciones consultan el historial
previo a la carga para mantener fijos sus totales.

B17 incluye el [contrato ejecutable](../test/carga/contrato-b17.mjs) para
Finanzas y las descargas de los últimos 7 y 30 días del historial preparado.
Genera de nuevo `.tmp/a14-esperados.json` con el SHA integrado para incluir
el costo del inventario sin retorno en las anulaciones. `A14_HASTA` debe
equivaler al inicio de un día comercial en Guayaquil.

```powershell
$env:A14_CONTRATO = 'test/carga/contrato-b17.mjs'
```

Con el mismo contrato ejecutar `base`, `excel` y `pdf`, restaurando la base
entre corridas. El banco añade 3 reportes/min, y por cada modo de descarga
lanza dos archivos típicos simultáneos y luego dos grandes simultáneos. Una
corrida con archivos solo cumple si el p95 de venta queda en `≤800 ms` y
`≤120 %` de una base que haya pasado con la misma configuración. Revisar en
el SHA integrado que cada generador quede fuera de la transacción de venta.

## Evidencia local

La línea base fue `c5dc81b` con los cambios de operación de A14. Se midió
en Windows con Node 22.14.0, PostgreSQL 17.4, Intel i5-12500H con 16 CPU
lógicas y 16 GiB de RAM. PostgreSQL tenía 25 conexiones máximas y 3
reservadas. Cada API usó una réplica con límite de 5 conexiones. Para esta
corrida se prepararon 1.000 ventas históricas por tienda.

- **1×** · 150 ventas con p95 de **88,90 ms**, 300 consultas de inventario
  con **24,36 ms**, 6 cierres con **29,26 ms** y 150 lecturas de Gym con
  **8,45 ms**. Las seis reaperturas completaron con p95 de **24,55 ms**.
  El WebSocket se mantuvo conectado. Hubo cero errores técnicos y todas las
  comprobaciones de stock, deuda, caja y aislamiento pasaron. La contención
  por la última unidad confirmó una venta y rechazó la otra.
- **1,5×** · 225 ventas con p95 de **82,88 ms**, 450 consultas de inventario
  con **22,01 ms**, 6 cierres con **33,66 ms** y 150 lecturas de Gym con
  **7,97 ms**. Las seis reaperturas completaron con p95 de **21,17 ms**.
  Hubo cero errores técnicos, sin desconexiones WebSocket y con todas las
  conciliaciones correctas. La contención confirmó una venta y rechazó la
  otra. El mayor nivel medido que cumplió fue 45 ventas y 90 consultas de
  inventario por minuto, con 6 cierres en 5 minutos.
- En **59 muestras PostgreSQL por corrida** se observaron hasta 3 conexiones
  de Gym y 2 de Tienda sin sesiones bloqueadas en esas muestras. El incremento
  acumulado del histograma de espera de Prisma a 1× fue de 1,60 ms en 386
  consultas de Gym y 0,79 ms en 1.371 consultas de Tienda. A 1,5× fue de
  0,94 ms en 386 consultas de Gym y 1,14 ms en 2.034 consultas de Tienda.
- En Node y Docker se reinició cada API por separado y la otra siguió lista.
  En Docker, al detener PostgreSQL, ambos procesos mantuvieron liveness
  en `200`, readiness devolvió `503` y luego volvió a `200` al recuperar la base.
- Fuera de la medición de latencia se verificó el historial grande de las
  tres tiendas. PostgreSQL confirmó 1.000 ventas por tienda dentro de
  7 días y 10.000 dentro de 30 días. El banco guardó los esperados en
  `.tmp/a14-esperados.json` y las mediciones en `.tmp/a14-base-1.json` y
  `.tmp/a14-base-1.5.json`.
- Pasaron 234 pruebas unitarias y las 16 pruebas HTTP/WebSocket de Gym.
  Se verificaron el lint del código TypeScript modificado, el formato de los
  scripts de carga y la compilación independiente en Node y Docker.

B15 y B17 quedan pendientes del SHA integrado. Los tiempos de esta sección
corresponden a venta, caja, inventario y Gym. La comparación con archivos
requiere repetir la base con las consultas financieras habilitadas.
