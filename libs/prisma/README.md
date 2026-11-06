# Prisma

Librería de infraestructura que exporta `PrismaModule` y `PrismaService` mediante
`@app/prisma`.

```ts
import { PrismaModule, PrismaService } from '@app/prisma';
```

`PrismaModule` conserva su alcance global dentro de cada aplicación Nest. Sus
consumidores utilizan la misma instancia de `PrismaService`; el cliente conecta
durante `onModuleInit` y desconecta durante `onModuleDestroy`, igual que antes
de la extracción. La librería no arranca un servidor ni comparte una instancia
en memoria entre procesos independientes.

El esquema y las migraciones permanecen en `prisma/`, en la raíz del repositorio.
Las variables de entorno y las consultas de los servicios del gimnasio conservan
su comportamiento. La librería no resuelve tenants, aplica permisos ni filtra
automáticamente las consultas: esas responsabilidades siguen en la aplicación.
Tampoco importa código desde `apps/`.

La aplicación incorpora esta librería mediante su compilación TypeScript.
`npm run build` genera el arranque en `dist/apps/gym-api/src/main.js` y la
librería en `dist/libs/prisma/src/`. `npm run start:prod` y Docker utilizan esa
ubicación del arranque. Para compilar solo la librería puede ejecutarse
`npx nest build prisma`; ese comando conserva los otros artefactos de `dist/`.

Las pruebas unitarias de la raíz incluyen esta carpeta. La prueba del módulo
comprueba la instancia global y los hooks de conexión con métodos simulados,
sin conectar con una base de datos.
