# Facturación

Espacio reservado para evaluar qué lógica de facturación puede reutilizarse
entre gimnasios y tiendas. Todavía no contiene servicios, cálculos ni contratos.

La implementación actual permanece en `apps/gym-api/src/factura/` y depende de membresías
(`clientePlan`) y cambios de plan del gimnasio. Por ello, no se considera que el
servicio completo sea ya una implementación común para ambos negocios.

En la siguiente etapa se revisarán las reglas coincidentes y las específicas,
sus dependencias y sus transacciones antes de definir una extracción. Ningún
servicio del gimnasio se ha copiado o conectado a esta librería.
