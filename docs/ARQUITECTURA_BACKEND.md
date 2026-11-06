# Arquitectura de BackendHero

## Estado de esta etapa

El repositorio utiliza un workspace NestJS en modo monorepo con una aplicación
activa: `gym-api`. El backend completo del gimnasio se trasladó a esa aplicación
conservando el contenido de sus archivos fuente y sus reglas de negocio.

Los puntos de entrada son `apps/gym-api/src/main.ts` y
`apps/gym-api/src/app.module.ts`. `tienda-api` y `libs/*` continúan siendo espacios
documentales; todavía no tienen servicios implementados ni despliegues propios.

## Organización actual

```text
BackendHero/
├── apps/
│   ├── README.md
│   ├── gym-api/
│   │   ├── src/                 Backend activo del gimnasio
│   │   ├── tsconfig.app.json
│   │   └── README.md
│   └── tienda-api/
│       └── README.md            Espacio futuro para tiendas
├── libs/
│   ├── README.md
│   ├── seguridad/
│   │   └── README.md
│   ├── contratos/
│   │   └── README.md
│   ├── utilidades/
│   │   └── README.md
│   └── facturacion/
│       └── README.md
├── prisma/                      Esquema y migraciones existentes
└── docs/
    └── ARQUITECTURA_BACKEND.md
```

## Ejecución y compatibilidad

Los comandos existentes se ejecutan desde la raíz: `npm run start`,
`npm run start:dev`, `npm run start:debug`, `npm test`, `npm run build` y
`npm run start:prod`. El proyecto predeterminado es `gym-api`; Nest también lo
acepta explícitamente con `npx nest build gym-api` y `npx nest start gym-api`.

La compilación usa `apps/gym-api/tsconfig.app.json` y genera
`dist/apps/gym-api/main.js`. El arranque de producción y Docker apuntan a ese
archivo. `tsconfig.build.json` conserva un acceso a la configuración de compilación
desde la raíz. Las pruebas unitarias siguen junto al código; las pruebas e2e
permanecen en `test/`.

El alias interno `src/*` apunta ahora a `apps/gym-api/src/*`. Su conservación
permite trasladar el código sin reescribir sus imports; Jest utiliza la misma
correspondencia y Nest transforma esos imports en la compilación.

Se conservan los métodos y rutas HTTP, entradas, respuestas, paginación y errores.
También el login y `POST /auth/select-context`, los tokens, roles, aislamiento
por tenant y namespace WebSocket `notifications`. La reorganización no requiere
cambios en el frontend ni en la dirección pública del backend.

Prisma, el esquema, las migraciones y los archivos de entorno permanecen en la
raíz. Las variables siguen suministrándose al proceso: no se añade carga
automática de `.env`. No se ejecutan migraciones como parte de este traslado.

## Arquitectura objetivo para tiendas y librerías

- Un repositorio con `gym-api` y `tienda-api`, cada una con su propio arranque,
  proceso y despliegue cuando se implemente la separación.
- Cada aplicación atenderá a varios negocios de su área mediante el contexto de
  tenant; no se plantea una aplicación por cada gimnasio o tienda.
- PostgreSQL compartido, conservando el esquema y las relaciones existentes en
  esta etapa. Los cambios futuros de esquema requerirán coordinación entre sus
  consumidores.
- Librerías para código cuyas reglas y significado sean realmente comunes.
  Cada aplicación incorporará ese código en su propia compilación y proceso.
- La separación de procesos permitirá reiniciar, desplegar y escalar cada
  aplicación por separado. La base de datos y la infraestructura compartida
  seguirán siendo dependencias comunes. Tiendas aún no se ejecuta por separado,
  por lo que el aislamiento entre ambas aplicaciones sigue pendiente.

Antes de compartir o separar implementaciones habrá que definir quién administra
cada dato, cómo se accede a los datos comunes y qué operaciones requieren una
transacción conjunta. Compartir una base no autoriza escrituras cruzadas sin
responsabilidades definidas.

## Siguiente etapa

Se revisará la clasificación de los módulos actuales entre aplicaciones y
librerías, sus dependencias, contratos y transacciones. Los nombres de las
carpetas compartidas expresan propósitos previstos, no extracciones ya decididas.

En particular, la facturación actual depende de membresías y cambios de plan
del gimnasio. Su ubicación en `apps/gym-api/src/factura/` se mantiene hasta identificar qué
reglas pueden compartirse con tiendas.

La implementación de tiendas y la extracción de código común se realizarán en
cambios posteriores, con verificación de los consumidores afectados.

## Verificación de esta entrega

La migración se verifica comparando el contenido de los archivos trasladados,
ejecutando las pruebas unitarias y compilando con la configuración nueva.
El análisis estático se compara con el estado previo al traslado; sus problemas
preexistentes se distinguen de los introducidos por la reorganización.

`npm run test:e2e:gym -- --runInBand` arranca el módulo completo con proveedores
de datos simulados y comprueba HTTP, CORS y el namespace de notificaciones con JWT,
sin conexión a una base real. Las pruebas e2e generales y la validación de los
flujos del frontend con datos reales requieren el PostgreSQL configurado disponible.

### Resultado de la migración del gimnasio (2026-11-04)

- 162 archivos fuente trasladados conservando su contenido exacto, incluidos los
  cambios locales que ya existían en productos y compras.
- 158 pruebas unitarias aprobadas y 10 comprobaciones HTTP/WebSocket aprobadas
  con proveedores de datos simulados.
- Compilación y comprobación TypeScript sin emisión correctas. Los 124 archivos
  JavaScript de la aplicación compilada son idénticos a los generados antes del
  traslado, comparados por ruta relativa y hash SHA-256.
- ESLint conserva exactamente los 391 errores y 79 advertencias preexistentes,
  sin diagnósticos nuevos. Se utilizó el análisis sin `--fix` para preservar el
  contenido trasladado.
- El esquema, las migraciones, las dependencias y el archivo de bloqueo se
  conservaron. No se modificó el frontend.
- La comprobación con datos reales queda pendiente: el PostgreSQL local
  configurado en el puerto 5433 no estaba disponible y Prisma devolvió `P1001`
  antes del traslado. El motor Docker tampoco estuvo disponible durante la
  verificación. Esto impidió probar el recorrido completo del frontend y el
  arranque de producción con esa base.
