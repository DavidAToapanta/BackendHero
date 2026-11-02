# Historial archivado

Estas 26 migraciones se conservaron byte por byte al preparar la baseline
`prisma/migrations/0_init/migration.sql`. No pertenecen al historial activo y no
deben ejecutarse sobre una base existente.

`manifest.json` contiene sus SHA-256. `production-variants` conserva las dos
versiones históricas recuperadas de Git que coinciden con los checksums de
producción, sin sustituir ni modificar los originales de desarrollo.

Las filas históricas de `_prisma_migrations` se conservan en las bases existentes.
La reconciliación añade únicamente el registro de `0_init`, tras verificar que
su esquema ya está presente. No se reescriben checksums ni se borran registros
históricos. El usuario informó que reconcilió producción y una verificación
posterior de solo lectura confirmó que `0_init` está registrado y que esquema
e historial antiguo coinciden con lo ensayado. El agente no modificó producción.

El procedimiento y las pruebas están documentados en
`docs/ENSAYO_RECONCILIACION_PRODUCCION_2026-11-01.md`.
