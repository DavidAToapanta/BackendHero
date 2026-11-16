# tienda-api

El punto de arranque usa `PORT` con `8081` por defecto. `AppModule` conecta
los módulos funcionales de Tienda. `auth` usa las librerías de identidad,
negocios y seguridad, `accesos` usa negocios y permisos, y `catalogo` e `inventario`
importan sus módulos compartidos desde `@app/*`.

Compilar con `npx nest build tienda-api` y arrancar con
`npx nest start tienda-api` después de configurar `DATABASE_URL` y
`TIENDA_JWT_SECRET`. El [contrato de autenticación](./src/auth/README.md)
documenta login, selección de tienda y consulta de sesión.

Para trabajar con recarga automática, ejecutar `npm run start:dev -- tienda-api`
desde la raíz. Tienda compila en `build/tienda-api` y Gym en `dist`, así que
pueden recompilarse en terminales separadas.

Las rutas de [clientes comerciales](./src/clientes/README.md),
[caja](./src/caja/README.md), [cobros](./src/cobros/README.md),
[cartera](./src/cartera/README.md), [ventas](./src/ventas/README.md),
[comprobantes internos](./src/comprobantes/README.md),
[análisis de ventas](./src/ventas/B14.md), [panel administrativo](./src/panel/README.md)
y [exportaciones](./src/exportaciones/README.md)
usan el contexto y los permisos de Tienda.
Cada escritura registra su auditoría dentro de la transacción. Los recursos
que aún esperan implementación responden `501 Not Implemented`.

El objetivo es un despliegue independiente del gimnasio, utilizando el PostgreSQL
existente. Los datos comunes y las responsabilidades de escritura se delimitarán
antes de conectar las aplicaciones. La existencia de tablas o relaciones en el
esquema actual no supone que haya una API de tiendas operativa.

Seguir el [plan de implementación de Tienda](../../docs/PLAN_IMPLEMENTACION_TIENDA.md)
para completar y verificar cada etapa y la
[guía de trabajo entre dos personas](../../docs/TRABAJO_EQUIPO_TIENDA.md)
para repartir carpetas, contratos y entregas. Consultar el
[documento de arquitectura](../../docs/ARQUITECTURA_BACKEND.md) para el contexto
del monorepo.
