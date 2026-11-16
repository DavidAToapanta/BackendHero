CREATE INDEX "AuditoriaOperacion_tenant_correlacion_fecha_id_idx"
ON "AuditoriaOperacion" ("tenantId", "correlacionId", "createdAt", "id");
