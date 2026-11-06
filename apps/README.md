# Aplicaciones

BackendHero utiliza un workspace NestJS con estos espacios:

- [gym-api](./gym-api/README.md): aplicación activa del gimnasio y proyecto predeterminado.
- [tienda-api](./tienda-api/README.md): espacio documental para la futura aplicación de tiendas.

El gimnasio arranca desde `apps/gym-api/src/main.ts`. Los comandos existentes de
arranque, pruebas y compilación siguen ejecutándose desde la raíz del repositorio.
Sus endpoints y reglas de negocio se conservan.

La configuración de Nest registra `gym-api` como aplicación y `prisma` y
`seguridad` como librerías. Tiendas y las otras librerías continúan como espacios documentales.
El módulo y cliente de conexión están en `libs/prisma`; el esquema y las
migraciones conservan su ubicación en `prisma/`, en la raíz.

Consultar el [documento de arquitectura](../docs/ARQUITECTURA_BACKEND.md).
