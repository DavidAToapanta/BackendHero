# Aplicaciones

BackendHero utiliza un workspace NestJS con estos espacios:

- [gym-api](./gym-api/README.md): aplicación activa del gimnasio y proyecto predeterminado.
- [tienda-api](./tienda-api/README.md): espacio documental para la futura aplicación de tiendas.

El gimnasio arranca desde `apps/gym-api/src/main.ts`. Los comandos existentes de
arranque, pruebas y compilación siguen ejecutándose desde la raíz del repositorio.
Sus endpoints y reglas de negocio se conservan.

La configuración de Nest registra únicamente `gym-api`. Tiendas y las librerías
compartidas se implementarán después de revisar responsabilidades y dependencias.
Prisma conserva su ubicación en la raíz; la base de datos futura será compartida.

Consultar el [documento de arquitectura](../docs/ARQUITECTURA_BACKEND.md).
