# gym-api

Aplicación activa para gimnasios. Atiende a varios gimnasios mediante el
contexto de tenant existente.

## Estado actual

El código antes ubicado en el `src/` de la raíz se trasladó íntegro a esta
aplicación, conservando sus reglas de negocio y los cambios locales existentes.
Los puntos de entrada son `src/main.ts` y `src/app.module.ts` dentro de esta carpeta.

## Comandos desde la raíz del repositorio

```bash
npm run start:dev
npm test -- --runInBand
npm run test:e2e:gym -- --runInBand
npm run build
npm run start:prod
```

`gym-api` es el proyecto predeterminado de Nest. También puede seleccionarse
explícitamente mediante `npx nest build gym-api` o `npx nest start gym-api`.
La compilación genera `dist/apps/gym-api/main.js`, utilizado por `start:prod`
y por Docker.

La configuración y las credenciales se suministran mediante el entorno del
proceso, igual que antes. El arranque no añade carga automática de `.env`.
En un entorno local con Node compatible puede ejecutarse la compilación con
`node --env-file=.env dist/apps/gym-api/main.js` para cargar ese archivo explícitamente.

La prueba `test:e2e:gym` comprueba el arranque del módulo completo, rutas protegidas,
validación HTTP, CORS y transporte WebSocket con proveedores de datos simulados.
La suite e2e general conserva las pruebas que requieren PostgreSQL real.

## Compatibilidad

Se conservan los métodos, rutas, entradas, respuestas, autenticación, selección
de contexto, roles, aislamiento por tenant y namespace `notifications`. Esta
reorganización no requiere cambiar la dirección pública del backend o el frontend.

Los imports existentes `src/*` siguen siendo válidos: TypeScript y Jest los
resuelven contra `apps/gym-api/src/*`. Nest los transforma al compilar para que
el código emitido pueda ejecutarse con Node.

Prisma permanece en la raíz del repositorio. La extracción de librerías y la
implementación de tiendas quedan para la siguiente etapa. Consultar el
[documento de arquitectura](../../docs/ARQUITECTURA_BACKEND.md).
