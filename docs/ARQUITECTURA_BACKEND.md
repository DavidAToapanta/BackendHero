# Arquitectura de BackendHero

## Estado de esta etapa

El repositorio utiliza un workspace NestJS en modo monorepo con una aplicación
activa: `gym-api`. El backend completo del gimnasio se trasladó a esa aplicación
conservando el contenido de sus archivos fuente y sus reglas de negocio.

Los puntos de entrada son `apps/gym-api/src/main.ts` y
`apps/gym-api/src/app.module.ts`. La infraestructura de conexión Prisma está en
`libs/prisma/src/` y la seguridad técnica común en `libs/seguridad/src/`.
`tienda-api` y las otras librerías continúan siendo espacios documentales;
todavía no tienen servicios implementados ni despliegues propios.

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
│   ├── prisma/
│   │   ├── src/                 Módulo y cliente de conexión
│   │   ├── tsconfig.lib.json
│   │   └── README.md
│   ├── seguridad/
│   │   ├── src/                 Contexto, guard y configuración JWT
│   │   ├── tsconfig.lib.json
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
`dist/apps/gym-api/src/main.js`. El arranque de producción y Docker apuntan a ese
archivo. `tsconfig.build.json` conserva un acceso a la configuración de compilación
desde la raíz. Las pruebas unitarias siguen junto al código; las pruebas e2e
permanecen en `test/`. Las pruebas unitarias también incluyen `libs/prisma/src/`.

El alias interno `src/*` apunta ahora a `apps/gym-api/src/*`. Su conservación
permite trasladar el código sin reescribir sus imports; Jest utiliza la misma
correspondencia y Nest transforma esos imports en la compilación.

`@app/prisma` es la entrada pública de la librería de conexión. Todos sus
consumidores usan ese alias y la misma clase `PrismaService`. Se conserva el
módulo global y sus hooks de conexión y desconexión. La librería no contiene
reglas del gimnasio ni depende de `apps/`.

TypeScript compila las fuentes de la aplicación y sus librerías conservando su
estructura desde la raíz del repositorio bajo `dist/`. Esto produce
`dist/apps/gym-api/src/main.js` y `dist/libs/prisma/src/index.js`. La configuración
de Jest resuelve los aliases registrados y los comandos de lint/formato incluyen Prisma.

`@app/seguridad` exporta el contexto autenticado, `getTenantIdOrThrow()`,
`JwtAuthGuard`, configuración común de JWT y una estrategia técnica base.
Los controladores de Gym consumen ese guard y helper; su estrategia concreta
conserva el mapeo de `req.user`. Login, selección de contexto, roles y el
fallback de `gym-principal` permanecen en la aplicación. Se conservan acceso
de un día, selección de diez minutos y la compatibilidad del socket.

La librería no depende de Gym ni de Prisma. Jest, lint, cobertura y compilación
incluyen ambas librerías. El informe y la lista de seguimiento del bloque están
en [INFORME_SEGURIDAD_COMPARTIDA.md](INFORME_SEGURIDAD_COMPARTIDA.md).

Se conservan los métodos y rutas HTTP, entradas, respuestas, paginación y errores.
También el login y `POST /auth/select-context`, los tokens, roles, aislamiento
por tenant y namespace WebSocket `notifications`. La reorganización no requiere
cambios en el frontend ni en la dirección pública del backend.

El esquema Prisma, las migraciones y los archivos de entorno permanecen en la
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

La implementación de tiendas y las demás extracciones de código común se
realizarán en cambios posteriores, con verificación de los consumidores afectados.

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

### Extracción de Prisma a librería (2026-11-06)

- `PrismaModule` y `PrismaService` se trasladaron a `libs/prisma/src/` sin cambiar
  su contenido. Los consumidores importan ambos desde `@app/prisma`.
- Los 165 archivos TypeScript preexistentes conservan su contenido, salvo los
  imports de Prisma y la ubicación de sus dos archivos. No se cambiaron rutas,
  DTO ni reglas de negocio.
- La compilación TypeScript incorpora aplicación y librería bajo `dist/`. El
  arranque de producción es ahora `dist/apps/gym-api/src/main.js`; los scripts,
  Docker y la resolución de aliases de Jest se actualizaron juntos.
- Pasaron 159 pruebas unitarias, incluida la instancia global y los hooks de
  conexión de Prisma, y 11 pruebas de integración HTTP/WebSocket. La prueba de
  `AppModule` utilizó PostgreSQL local real; las de contratos usan datos simulados.
- Compilación de aplicación, compilación independiente de la librería y
  comprobación TypeScript sin emisión correctas.
- El ejecutable de producción arrancó con PostgreSQL local, registró 111 rutas,
  superó ocho comprobaciones HTTP y entregó `notificationsUpdate` por WebSocket.
  La comprobación utilizó solo lecturas y no sustituyó una revisión manual
  completa del frontend.
- ESLint mantiene 391 errores y 79 advertencias preexistentes, con las mismas
  reglas y ubicaciones. La librería y su prueba no añaden diagnósticos.
- El esquema, las migraciones, las dependencias y el frontend permanecieron
  intactos. No se ejecutaron migraciones ni escrituras de datos.

### Seguridad técnica compartida (2026-11-06)

`@app/seguridad` contiene el contexto autenticado, guard, configuración JWT y
estrategia base. Gym conserva mapeo de usuario, login, selección de contexto,
roles y fallback legacy. Se verificaron 186 pruebas unitarias, 17 de integración,
compilación de aplicación/librería y arranque de producción con PostgreSQL local,
111 rutas y HTTP/WebSocket. El informe y el avance de los bloques están en
[INFORME_SEGURIDAD_COMPARTIDA.md](INFORME_SEGURIDAD_COMPARTIDA.md).
