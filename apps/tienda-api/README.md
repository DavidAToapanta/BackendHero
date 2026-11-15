# tienda-api

El punto de arranque usa `PORT` con `8081` por defecto. `AppModule` conecta
los módulos funcionales de Tienda. `auth` usa las librerías de identidad y
negocios, `accesos` usa negocios y permisos, y `catalogo` e `inventario`
importan sus módulos compartidos desde `@app/*`.

Compilar con `npx nest build tienda-api` y arrancar con
`npx nest start tienda-api` después de configurar `DATABASE_URL`.

Para trabajar con recarga automática, ejecutar `npm run start:dev -- tienda-api`
desde la raíz. Tienda compila en `build/tienda-api` y Gym en `dist`, así que
pueden recompilarse en terminales separadas.

Cada recurso REST incluye controlador, servicio, DTO de creación y
actualización, y entidad base. Las rutas responden `501 Not Implemented` hasta
que se implemente cada operación con las reglas del negocio.

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
