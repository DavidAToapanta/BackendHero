# tienda-api

Espacio reservado para la futura aplicación de tiendas, que atenderá a varios
negocios mediante su contexto de tenant.

Actualmente esta carpeta solo contiene documentación. No expone endpoints,
inicia procesos ni establece conexiones a la base de datos.

Catálogo, inventario, ventas, caja y devoluciones son áreas previstas para revisar
en la siguiente etapa; todavía no se ha asignado ni implementado ningún módulo.

El objetivo es un despliegue independiente del gimnasio, utilizando el PostgreSQL
existente. Los datos comunes y las responsabilidades de escritura se delimitarán
antes de conectar las aplicaciones. La existencia de tablas o relaciones en el
esquema actual no supone que haya una API de tiendas operativa.

Consultar el [documento de arquitectura](../../docs/ARQUITECTURA_BACKEND.md).
