# Tienda en Cloud Run y PostgreSQL de producción

Preparado el 22 de noviembre de 2026. Los comandos de escritura de esta guía
no se ejecutan automáticamente. Los valores entre `<...>` requieren completar
configuración real. Ejecutar los bloques PowerShell desde BackendHero.

## Corte de Gym completado el 22 de noviembre de 2026

A las 19:34 de Ecuador, Cloud Run pasó el 100 % del tráfico de Gym a
`backendhero-api-prod-sql20gb` con la misma URL pública. Usa `SistemaGym` en
`hero-gym-prod-db-20gb` y `DATABASE_URL` desde el secreto
`hero-gym-prod-db-url-20gb`, versión 1, con el rol `hero_gym_runtime`.

Con las escrituras pausadas, coincidieron las 33 tablas de negocio, sus 1.596
filas y los valores de 33 secuencias. Se verificaron las dos migraciones de
Tienda en el destino. Después del cambio, `/health/live`, `/health/ready` y
`/` respondieron 200. `/producto` respondió 401 sin autenticación y el rol de
Gym pasó una prueba de escritura sin modificar filas.

Se guardó el respaldo lógico final de `SistemaGym` a las 19:31 de Ecuador.
La base original quedó en solo lectura en `hero-gym-prod-db`, con la instancia
encendida. Si hay que volver a esa base después de habilitar escrituras en la
nueva, primero hay que reconciliar las transacciones posteriores al corte.
El despliegue de Tienda queda pendiente.

## Preparación y ensayos previos al corte

Antes del corte Gym usaba `backendhero-api-prod-00011-58r`. Se fijó el commit
`88f12bf`, de `origin/dev2.1`, para la revisión nueva. La revisión anterior
falla al crear productos con el esquema de Tienda.

La instancia de 20 GB pasó a `db-f1-micro`, con 0,6 GiB de RAM y el mismo SSD.
El subtotal estimado para 730 horas es USD 11,07 al mes antes de respaldos,
tráfico e impuestos. PostgreSQL 18.6 sigue operativo, con las nueve migraciones
activas y un `max_connections` efectivo de 25. [Tarifas de Google Cloud](https://cloud.google.com/sql/pricing).

En `db-f1-micro`, ambas APIs respondieron HTTP 200 en salud y conexión. En
la primera ejecución pasaron 35 pruebas y la prueba del portal falló por
`ECONNRESET` en la conexión HTTP local del Job. La repetición con bases de
prueba limpias pasó las 36 pruebas, 4 de Gym y 32 de Tienda, incluido el
portal. [Ejecución regional en micro](https://console.cloud.google.com/run/jobs/executions/details/us-central1/hero-cut-verification-d44bde7a-bk5f4?project=gym-prod-492501).

### Configuración que cambiaría

- **Gym**, `backendhero-api-prod`, `us-central1`. Conservar el servicio y su URL.
  Preparar una revisión nueva con la imagen `backendhero-gym-cut` fijada al
  digest `sha256:8449b24b8e7bba42d1ebed64ec3306103d0557b3d14c1bb4973ba47d75644e32`.
  Sustituir la conexión a `gym-prod-492501:us-central1:hero-gym-prod-db` por
  `gym-prod-492501:us-central1:hero-gym-prod-db-20gb`. Reemplazar el valor de
  `DATABASE_URL` por la referencia propuesta `hero-gym-prod-db-url-20gb`, con
  versión fijada cuando se cree. Conservar la configuración de firma de Gym.
  Preparar la revisión con el tráfico aún fijado al 100 % en la revisión anterior.
- **Tienda**, nuevo servicio privado `backendhero-tienda-prod`, `us-central1`,
  puerto 8081. Usar `backendhero-tienda-cut` fijada al digest
  `sha256:96d4a6df515e5136768ddfeb8b35888afedb1b5effab921e04d4ac84bd268103`,
  la misma instancia de 20 GB y las referencias propuestas
  `hero-tienda-prod-db-url-20gb` y `hero-tienda-prod-jwt`, con versión fijada.
  Configurar el origen de Firebase cuando se defina el acceso público.
- Ambas URLs de Prisma apuntarían a `SistemaGym` y usarían el socket
  `/cloudsql/gym-prod-492501:us-central1:hero-gym-prod-db-20gb`. Preparar roles
  de aplicación con permisos sobre `public`, conservando un rol separado para
  migraciones. Revisar `Cloud SQL Client` y otorgar acceso únicamente a las
  referencias de secretos que usa cada identidad. En `db-f1-micro` se propone
  `connection_limit=5` y `pool_timeout=10`, con límites iniciales de servicio de
  dos contenedores para Gym y uno para Tienda. El consumo nominal máximo de
  las dos APIs sería de 15 conexiones. PostgreSQL informa 25 conexiones y
  reserva al menos tres para administración. Revisar el uso durante el corte
  y los despliegues con solapamiento de revisiones.
- Las imágenes se almacenan en el repositorio privado
  `us-central1-docker.pkg.dev/gym-prod-492501/cloud-run-source-deploy`. El build
  `6eedc275-3aac-44f2-9b95-884f6f962046` produjo ambas y la imagen de ensayo.

### Evidencia de la verificación regional

La ejecución `hero-cut-verification-d44bde7a-2nw66` de Cloud Run en
`us-central1` terminó con éxito contra dos bases desechables de la instancia
de 20 GB. Gym pasó 4 pruebas de integración y Tienda pasó 32. Ambas APIs
devolvieron HTTP 200 en `/health/live` y `/health/ready`. Las pruebas cubrieron
login, registro y aislamiento de tiendas, productos, compras, caja, ventas,
comprobantes, IVA y devoluciones.

El primer ensayo agotó la memoria de Jest. El siguiente completó las pruebas
y encontró una expectativa antigua de `/auth/session`. La prueba se ajustó
para comprobar `esPropietario` y los permisos efectivos documentados. El
ensayo final conservó el mismo código y las mismas imágenes de aplicación.
[Ejecución regional final](https://console.cloud.google.com/run/jobs/executions/details/us-central1/hero-cut-verification-d44bde7a-2nw66?project=gym-prod-492501).

### Secuencia de corte propuesta

1. Acordar una ventana, impedir nuevas escrituras en Gym y confirmar el drenaje
   de solicitudes y transacciones del servicio. Cerrar o drenar también las
   conexiones de larga duración. La comparación de las 16:54 de Ecuador
   coincidió en 33 tablas, 1.596 filas y 33 secuencias. Repetirla durante la
   ventana, porque la instancia original sigue siendo la fuente de producción.
2. Si hay diferencias, exportar un respaldo lógico nuevo desde el origen con
   PostgreSQL 18, restaurarlo en una base aparte de la instancia de 20 GB,
   aplicar allí las migraciones y comparar los datos y secuencias una vez más.
   Ajustar la base de destino en ambas referencias de conexión si se usa esa
   base para el corte. Conservar ambas instancias y la copia previa.
3. Verificar en la base definitiva el historial Prisma, los hashes de datos
   compartidos y los permisos de los roles. Crear y comprobar las versiones de
   los secretos. Validar el arranque y `/health/ready` de ambas imágenes antes
   de mover tráfico. Conservar el 100 % actual hasta concluir las pruebas.
4. Pasar el tráfico de Gym a la revisión nueva durante la ventana y verificar
   login, catálogo y compras antes de levantar el bloqueo de escrituras. Tienda
   queda privada para verificar login, catálogo, caja, venta y comprobante.
5. Si falla antes de habilitar escrituras, enrutar Gym de vuelta a
   `backendhero-api-prod-00011-58r` y reabrir el origen. Si ya se confirmaron
   escrituras en el destino, mantener la pausa y reconciliar esas transacciones
   antes de volver al origen. Conservar las dos instancias en ambos casos.

## Ensayo de traslado a Cloud SQL de 20 GB

El 22 de noviembre de 2026 se aprovisionó `hero-gym-prod-db-20gb` en
`us-central1-a` con PostgreSQL 18.6, `db-g1-small` (1,7 GiB de RAM), 20 GB SSD,
respaldos automáticos con retención de siete copias y protección contra borrado.
El subtotal estimado para 730 horas encendida es USD 28,95 al mes, antes de
respaldos, tráfico e impuestos. Ambas instancias siguen facturando mientras
coexistan. [Tarifas de Google Cloud](https://cloud.google.com/sql/pricing).

- Se tomó un respaldo lógico de `SistemaGym` a las 11:04 de Ecuador con
  `pg_dump` 18.6 y una transacción de origen de solo lectura. `pg_restore`
  preservó los datos sin heredar los 100 GB de la instancia original.
- La copia restaurada coincidió en las 34 tablas públicas, 1.621 filas,
  secuencias, estructura e historial Prisma. Se aplicaron las seis migraciones
  pendientes en la instancia nueva. Prisma quedó al día, con 74 tablas
  públicas y 31 registros de historial. Los valores originales de las
  columnas de las 33 tablas de negocio coincidieron antes y después.
  La comparación de PostgreSQL contra `schema.prisma` tampoco encontró
  diferencias.
- Gym y Tienda arrancaron con el código local del commit `2e62a7f` y
  devolvieron HTTP 200 en `/health/live` y `/health/ready`. Las cuatro
  pruebas de integración de Gym pasaron en una base de ensayo.
- Se probó también la imagen exacta de Gym en Cloud Run. Inició, registró
  un propietario e inició sesión, pero `POST /producto` devolvió HTTP 500.
  La comprobación SQL confirmó `23502` en `Producto.updatedAt`: esa revisión
  no envía una columna que el esquema migrado requiere. La versión actual de
  Gym sí pasó el flujo de creación y compra. El corte debe prever la revisión
  compatible de Gym junto con el cambio de conexión.
- Tienda pasó la prueba de selección de contexto, pero la batería completa
  por el túnel local tuvo límites de tiempo y fallos HTTP 500. Al repetir
  cuatro flujos con un límite general de Jest de 60 segundos, pasó uno y
  fallaron tres. Prisma registró `P2028` en transacciones de ventas y registro.
  La prueba de carga de foto y venta conservó su límite explícito de 20
  segundos y lo superó. El ensayo no valida esos flujos desde `us-central1`.
- Se confirmó que Cloud Run sigue en la revisión
  `backendhero-api-prod-00011-58r` conectada a `hero-gym-prod-db`. La copia
  corresponde al snapshot de las 11:04. Para un corte posterior, evaluar los
  cambios desde esa hora y sincronizar con un respaldo final bajo una ventana
  acordada. La sección de comandos de esta guía aún referencia la instancia
  original y no se ejecutó contra ella.
- A las 11:42 de Ecuador, la comparación de solo lectura con el snapshot
  seguía sin diferencias en datos, secuencias, esquema ni historial del
  origen. Se eliminaron las tres bases desechables de la instancia nueva y
  se cerraron los túneles. Las dos instancias y sus bases `SistemaGym`
  quedaron operativas.

## Infraestructura observada

- Proyecto: `gym-prod-492501`, región `us-central1`.
- Gym: servicio `backendhero-api-prod`, revisión `backendhero-api-prod-00011-58r`.
- Cloud SQL: `hero-gym-prod-db`, PostgreSQL 18, Enterprise, zonal,
  `db-g1-small`, 1,7 GiB de memoria y 100 GB de SSD provisionados.
- Conexión: `gym-prod-492501:us-central1:hero-gym-prod-db`.
- El servicio Gym tiene un disparador de Cloud Build que actualiza Gym.
  Ese disparador construye Dockerfile sin `--target`; el último target actual
  sigue siendo `gym`. No reutilizar ese disparador para publicar Tienda.
- Tienda tiene que construirse con `--target tienda`. Su entrada es
  `build/tienda-api/apps/tienda-api/src/main.js`; el puerto propuesto es 8081.
- Gym y Tienda comparten esquema e historial Prisma. No se necesita otra
  instancia SQL exclusivamente para Tienda.

## Desarrollo, Git y datos

Se puede construir manualmente desde el checkout local sin fusionar a `main`.
Cloud Build recibe los archivos locales, incluidos cambios sin commit que no
estén ignorados; revisar `git status` y el contenido enviado antes de publicar.
Este procedimiento no hace commit, push, merge ni modifica el disparador de Gym.
La rama observada durante la revisión fue `dev2`.

Las migraciones trasladan cambios estructurales. No trasladan productos,
usuarios, imágenes, ventas ni otros datos de la base de desarrollo. Mantener
los datos reales de Gym en producción. Si hay datos locales de Tienda que se
deban conservar, preparar una importación selectiva por tenant como operación
separada; nunca restaurar toda la base de desarrollo encima de producción.

## Primero: respaldo y compatibilidad

La consulta de producción del 22 de noviembre, a las 10:06 (America/Guayaquil),
se ejecutó con `default_transaction_read_only=on` y `BEGIN READ ONLY`:

- `SistemaGym`: PostgreSQL 18.6, 11.171.519 bytes (unos 10,7 MiB), 34 tablas
  públicas y `max_connections=50`.
- `0_init` aplicada y checksum igual al archivo local. Sin migraciones fallidas.
- Las seis migraciones posteriores a `0_init` están pendientes, desde
  `20261103120000_add_store_schema` hasta `20261121120000_add_store_image_files`.
- Cuatro negocios GYM y ningún negocio STORE. Cinco productos; ninguno falla
  las comprobaciones iniciales de precio/stock o necesita redondeo.

Esto verifica las condiciones anteriores, pero no reemplaza el ensayo de
todas las restricciones, triggers y rutas de ambas aplicaciones sobre una copia.

Durante la revisión inicial la instancia estaba detenida, no tenía respaldos
automáticos ni PITR habilitados y la lista de backups de Cloud SQL estaba vacía.
El usuario autorizó encenderla para revisar. No confundir encender con migrar.

Antes de aplicar SQL:

1. Confirmar estado `RUNNABLE` y obtener un respaldo nuevo, con restauración
   comprobada en otra base aislada. Usar herramientas compatibles con PostgreSQL 18.
2. Revisar `_prisma_migrations` en producción. El informe histórico del repo
   documenta la reconciliación de `0_init`, pero hay que verificar el estado actual.
3. Ensayar todas las migraciones pendientes sobre la copia restaurada y probar
   Gym, especialmente productos y compras: `Producto.precio` cambia de Float
   a Decimal(18,2). No asumir compatibilidad solo porque el proceso de Gym
   sigue desplegado. Conservar su contrato numérico al actualizarlo si es necesario.
4. La migración STORE aborta si existen precios que requieren redondeo o
   precio/stock incompatibles. Resolver esos casos con una decisión explícita,
   sin borrar productos ni marcar como aplicada una migración fallida.

No usar `migrate reset`, `migrate dev` ni `db push` en producción. No ejecutar
las migraciones de `prisma/migrations_legacy`. No ejecutar `0_init` encima de
tablas ya existentes ni volver a registrar la baseline sin verificarla.

## Construir una imagen de Tienda sin desplegar

Primero comprobar `npm ci`, `npx prisma generate` y `npm run build:tienda`
en el entorno de construcción. El Dockerfile ya realiza instalación,
generación de Prisma y compilación en su target Tienda.

```powershell
$tiendaProject = 'gym-prod-492501'
$tiendaRegion = 'us-central1'
$tiendaSql = 'gym-prod-492501:us-central1:hero-gym-prod-db'
$tiendaTag = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$tiendaImage = "us-central1-docker.pkg.dev/$tiendaProject/cloud-run-source-deploy/backendhero-tienda-prod:$tiendaTag"
gcloud meta list-files-for-upload
gcloud builds submit . --project=$tiendaProject --region=$tiendaRegion --config=deploy/cloudbuild.tienda.yaml --substitutions="_IMAGE=$tiendaImage"
```

Revisar antes la lista de archivos: `.gcloudignore` excluye `.env*`, respaldos,
archivos temporales, dependencias y salidas compiladas. No se envían secretos
como argumentos de construcción. Guardar la referencia de imagen y el digest
del build correcto para usar exactamente el mismo artefacto al publicar.

## Migraciones, una sola vez y antes de arrancar Tienda

La revisión local utiliza el Cloud SQL Auth Proxy oficial en
`127.0.0.1:5434`, conectado a la instancia anterior. `.env.production.real`
ya está ignorado por Git y contiene la conexión de esa base a través del túnel.
La revisión cierra su proxy al terminar: para una sesión posterior, abrir un
túnel nuevo, verificar su instancia de destino y no confundirlo con Postgres local.

Una vez autorizado el cambio, con respaldo y ensayo correctos:

```powershell
# Solo consulta; Prisma puede devolver código 1 cuando hay pendientes.
node --env-file=.env.production.real node_modules/prisma/build/index.js migrate status --schema prisma/schema.prisma

# ESCRITURA: ejecutar únicamente después del respaldo y ensayo.
node --env-file=.env.production.real node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

# Comprobar que no quedan pendientes ni migraciones fallidas.
node --env-file=.env.production.real node_modules/prisma/build/index.js migrate status --schema prisma/schema.prisma
```

`migrate deploy` aplica los archivos pendientes del repositorio; no genera
migraciones ni Prisma Client. No hacer que todas las réplicas ejecuten
migraciones al arrancar. En despliegues posteriores, puede usarse un Cloud Run
Job con la misma imagen, una tarea, cero reintentos, la conexión Cloud SQL
y el secreto de base, ejecutando `./node_modules/.bin/prisma migrate deploy`.

## Configurar y publicar el servicio

Preparar en Secret Manager una versión de la URL de producción para Tienda
con el socket `/cloudsql/gym-prod-492501:us-central1:hero-gym-prod-db` y un
pool inicial limitado, por ejemplo `connection_limit=5&pool_timeout=10`.
Debe apuntar a `SistemaGym`, usando credenciales autorizadas de esa base;
`127.0.0.1:5434` solo sirve en la computadora con el proxy, no dentro de Cloud Run.
Preparar también un `TIENDA_JWT_SECRET` aleatorio, distinto del secreto efectivo
de Gym. No cambiar el secreto de Gym durante este despliegue.

La identidad de ejecución debe tener Cloud SQL Client y acceso exclusivamente
a los secretos requeridos. Verificar o autorizar esos permisos antes del deploy.
Se observó la identidad `328397609474-compute@developer.gserviceaccount.com`
en Gym; elegir y revisar la identidad de Tienda antes de reutilizarla.

```powershell
$tiendaRuntime = '<cuenta-de-servicio-autorizada>'
$tiendaDbSecret = '<secreto-url-produccion>:<version>'
$tiendaJwtSecret = '<secreto-jwt-tienda>:<version>'
gcloud run deploy backendhero-tienda-prod --project=$tiendaProject --region=$tiendaRegion --image=$tiendaImage --service-account=$tiendaRuntime --port=8081 --cpu=1 --memory=512Mi --min=0 --max=2 --concurrency=20 --set-cloudsql-instances=$tiendaSql --set-secrets="DATABASE_URL=$tiendaDbSecret,TIENDA_JWT_SECRET=$tiendaJwtSecret" --set-env-vars='NODE_ENV=production,TIENDA_CORS_ORIGINS=' --no-allow-unauthenticated
```

El servicio queda inicialmente privado por IAM para su verificación. Antes
de conectarlo a una aplicación pública de Firebase hay que autorizar el
acceso público a Cloud Run; la autenticación de usuarios sigue siendo la JWT
de Tienda. Configurar entonces `TIENDA_CORS_ORIGINS` con los orígenes reales
de Firebase y el dominio propio. No se necesita conocer ese dominio para
preparar o verificar ahora el backend de forma privada.

Verificar `/health/live`, `/health/ready`, logs, registro/login y aislamiento
de tenant, además de las rutas reales de Gym. Readiness por sí sola verifica
conectividad, no que existan todas las tablas de Tienda. El registro de una
tienda nueva usa `/auth/register-owner` y prepara sus roles; no copiar usuarios
de prueba ni modificar el tipo de negocio del tenant de Gym para habilitarla.

El frontend Angular usa `/api/tienda`: cuando se publique en Firebase Hosting,
preparar la reescritura con eliminación de ese prefijo o configurar una URL
de API directa compatible. El proxy local de Angular no se publica en Firebase.

## Recuperación

Si el build o la verificación falla, no publicar el servicio. Si falla una
migración, detener la secuencia, conservar logs y revisar su estado antes de
reintentar. Volver a una revisión de Cloud Run no revierte cambios de esquema.
No restaurar un dump automáticamente sobre producción con operaciones nuevas.

## Costos y cambios por separado

El 22 de noviembre, el informe de facturación filtrado a este proyecto mostraba
aproximadamente USD 24,71 acumulados del 1 al 22: SSD USD 11,93, cómputo USD 10,80
e IP reservada USD 1,97, con diferencias de centavos por redondeo. Cloud Run
mostraba USD 0 netos tras ahorros. La previsión del mes era USD 32,60 y refleja
el patrón de encendido/apagado, no operación 24/7.

Con tarifas públicas de us-central1 y 730 horas, `db-g1-small` cuesta USD 25,55
de cómputo y 100 GiB SSD USD 17: subtotal USD 42,55 antes de backups, impuestos
y tráfico. Una instancia nueva con igual memoria y 20 GiB SSD tendría un
subtotal estimado USD 28,95: USD 13,60 menos por mes 24/7, sujeto a requisitos
de tamaño mínimo y rendimiento. No es una cotización ni el costo de dos instancias.

No reducir a `db-f1-micro` sin ensayo: la memoria observada en 30 días llegó
a 1,39 GiB. El disco usado máximo observado fue 180.850.688 bytes, unos 173 MiB;
no confundir ese valor con el espacio mínimo que exige Cloud SQL para operar.
Apagar suspende cómputo, pero mantiene el cargo de disco y de IP inactiva.

El storage shrink directo no está soportado para CPU compartida. Evaluar una
instancia nueva de menor disco, restaurar y verificar una copia, probar ambas
APIs y cambiar conexiones en una ventana acordada. Habrá cargos simultáneos
durante la transición. Otra alternativa requiere cambiar temporalmente a CPU
dedicada para evaluar shrink. Ninguna se ejecuta como parte de esta guía.
Separar el traslado para ahorrar disco de las migraciones de Tienda permite
verificar cada operación y recuperar con menor incertidumbre.

Referencias: [Prisma 6 en producción](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production),
[tarifas Cloud SQL](https://cloud.google.com/sql/pricing),
[límites de storage shrink](https://docs.cloud.google.com/sql/docs/postgres/about-storage-shrink),
[detener e iniciar Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance).
