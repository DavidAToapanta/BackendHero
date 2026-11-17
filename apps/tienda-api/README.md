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

## Conexión desde el frontend

Configura `TIENDA_CORS_ORIGINS` en el entorno de Tienda con los orígenes exactos
del frontend (protocolo, host y puerto si aplica), separados por comas y sin
rutas. Por ejemplo, en PowerShell:

```powershell
$env:TIENDA_CORS_ORIGINS = 'http://localhost:5173,https://tienda.example.com'
```

En ejecución local, si la variable no existe, se permiten
`http://localhost:5173` y `http://127.0.0.1:5173`. En producción y con
`compose.apis.yml`, configura la lista explícitamente para permitir llamadas
desde otro origen. Un valor vacío deja la lista vacía.

El navegador puede enviar `Authorization`, `Content-Type`, `Idempotency-Key`
y `X-Request-Id`, y leer `Content-Disposition` de las descargas y
`X-Request-Id` de las respuestas.

Las rutas de [clientes comerciales](./src/clientes/README.md),
[caja](./src/caja/README.md), [cobros](./src/cobros/README.md),
[cartera](./src/cartera/README.md), [ventas](./src/ventas/README.md),
[comprobantes internos](./src/comprobantes/README.md),
[análisis de ventas](./src/ventas/B14.md), [panel administrativo](./src/panel/README.md)
y [exportaciones](./src/exportaciones/README.md)
usan el contexto y los permisos de Tienda.
Cada escritura registra su auditoría dentro de la transacción. Los recursos
del comprador se describen en el [contrato del portal](./src/portal/README.md).
Incluye vinculación, catálogo, carrito, pedidos para retiro y avisos.

Tienda se despliega de forma independiente de Gym y comparte PostgreSQL. Aplica
las migraciones vigentes antes de arrancar. El portal usa una sesión de
comprador y el personal sigue usando el contrato de autenticación de Tienda.

Seguir el [plan de implementación de Tienda](../../docs/PLAN_IMPLEMENTACION_TIENDA.md)
para completar y verificar cada etapa y la
[guía de trabajo entre dos personas](../../docs/TRABAJO_EQUIPO_TIENDA.md)
para repartir carpetas, contratos y entregas. Consultar el
[documento de arquitectura](../../docs/ARQUITECTURA_BACKEND.md) para el contexto
del monorepo.
