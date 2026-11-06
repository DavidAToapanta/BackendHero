# Librerías compartidas futuras

Esta carpeta reserva espacios para código reutilizable por `gym-api` y
`tienda-api`. Actualmente solo contiene documentación; el código del gimnasio
permanece íntegro en `apps/gym-api/src/` y todavía no se ha extraído a librerías.

| Carpeta | Propósito previsto |
| --- | --- |
| [seguridad](./seguridad/README.md) | Elementos comunes de autenticación y contexto del negocio. |
| [contratos](./contratos/README.md) | Interfaces y tipos de comunicación explícitos. |
| [utilidades](./utilidades/README.md) | Funciones generales con comportamiento común. |
| [facturacion](./facturacion/README.md) | Espacio para evaluar la lógica de facturación reutilizable. |

Una librería futura se incorporará en cada aplicación que la utilice y se
ejecutará dentro de su proceso. No será un servicio con servidor propio.

Se compartirá código cuando coincidan sus reglas y significado para ambos
negocios. La ubicación definitiva de cada módulo se decidirá después de revisar
sus dependencias. Los cambios en una librería compartida deberán verificarse en
ambas aplicaciones; cada una incorporará esos cambios al reconstruirse y
desplegarse.

Consultar el [documento de arquitectura](../docs/ARQUITECTURA_BACKEND.md).
