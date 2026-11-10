# Librerías

Esta carpeta contiene las librerías que usa `gym-api` y espacios reservados para
futuras extracciones. `tienda-api` todavía no tiene implementación.

| Carpeta | Propósito previsto |
| --- | --- |
| [prisma](./prisma/README.md) | Implementada: módulo y cliente de conexión a PostgreSQL mediante `@app/prisma`. |
| [seguridad](./seguridad/README.md) | Contexto autenticado, guard JWT, configuración y estrategia técnica base mediante `@app/seguridad`. |
| [identidad](../docs/INFORME_IDENTIDAD_COMPARTIDA.md) | Búsqueda, verificación de credenciales, detección de coincidencias y creación de cuentas mediante `@app/identidad`. |
| [negocios](../docs/INFORME_NEGOCIOS_COMPARTIDOS.md) | Negocios, módulos habilitados y vinculaciones de personal mediante `@app/negocios`. |
| [permisos](../docs/INFORME_PERMISOS_COMPARTIDOS.md) | Base interna para catálogo, roles, asignaciones y autorización por negocio mediante `@app/permisos`. |
| `catalogo` | Servicios compartidos de catálogo mediante `@app/catalogo`. |
| `inventario` | Servicios compartidos de inventario mediante `@app/inventario`. |
| [contratos](./contratos/README.md) | Interfaces y tipos de comunicación explícitos. |
| [utilidades](./utilidades/README.md) | Funciones generales con comportamiento común. |
| [facturacion](./facturacion/README.md) | Espacio para evaluar la lógica de facturación reutilizable. |

Una librería se incorpora en cada aplicación que la utiliza y se ejecuta dentro
de su proceso. No es un servicio con servidor propio. La dependencia va desde
la aplicación a la librería; una librería no debe importar código de `gym-api`.

Se compartirá código cuando coincidan sus reglas y significado para ambos
negocios. La ubicación definitiva de cada módulo se decidirá después de revisar
sus dependencias. Los cambios en una librería compartida deberán verificarse en
ambas aplicaciones; cada una incorporará esos cambios al reconstruirse y
desplegarse.

Consultar el [documento de arquitectura](../docs/ARQUITECTURA_BACKEND.md).
