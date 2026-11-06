# Seguridad

Espacio reservado para evaluar elementos comunes de autenticación, validación
de tokens y resolución del contexto del negocio.

Actualmente no contiene implementación. La autenticación, los guards y las
utilidades de tenant siguen en `apps/gym-api/src/`.

Una extracción futura deberá preservar el flujo de login y selección de contexto,
las reglas de roles y la obtención del tenant desde el usuario autenticado.
Las reglas de acceso específicas de cada negocio se revisarán antes de decidir
si pertenecen a una librería común.
