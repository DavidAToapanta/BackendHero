# B17 · Exportaciones de Tienda

Las descargas usan el token de Tienda y su negocio. Las tres rutas
requieren `store.reports.export` además del permiso indicado.

| Ruta | Permiso de la fuente | Filtros |
| --- | --- | --- |
| `GET /exportaciones/ventas/:formato` | `store.sales.analytics.read` | Igual que [análisis de ventas](../ventas/B14.md). Incluye filtros, resumen, tendencias, productos y cajeros. |
| `GET /exportaciones/finanzas/:formato` | `store.reports.read` | Igual que [resumen financiero](../finanzas/README.md#b15--resumen-financiero). |
| `GET /exportaciones/caja/turnos/:id/:formato` | `store.cash.read` | Turno cerrado. Para un turno ajeno también exige `store.cash.manage`. |

`:formato` admite `xlsx` y `pdf`. Para el comprobante de una venta,
usa la [descarga propia de B12](../comprobantes/README.md) con
`store.receipts.read`.

```text
GET /exportaciones/ventas/xlsx?desde=2026-05-01&hasta=2026-06-01&granularidad=mes
GET /exportaciones/finanzas/pdf?desde=2026-05-01&hasta=2026-06-01
GET /exportaciones/caja/turnos/12/xlsx
GET /comprobantes/42/pdf
```

Una descarga correcta devuelve `200`, el MIME del archivo y
`Content-Disposition: attachment`. Los códigos `400`, `401`, `403`,
`404` y `409` indican respectivamente filtros o formato inválidos,
sesión inválida, permiso insuficiente, recurso ajeno o inexistente, y
turno aún abierto. Los períodos comerciales tienen un máximo de 366 días.
Ventas exporta hasta 54 semanas o 13 meses, 25 productos y 100 cajeros,
según los límites de la consulta de origen. Finanzas y cierre exportan
resúmenes de tamaño fijo. Los archivos se generan después de que termina
la consulta y el proceso de descarga no escribe datos comerciales.

## Reproducir los flujos

Sigue los [escenarios de A13](../../../../test/README.md) para preparar
PostgreSQL y ejecutar la suite HTTP. La prueba de mostrador devuelve
mercancía apta y dañada, descarga ambos reportes en los dos formatos,
anula el remanente y descarga el cierre. La prueba de crédito comprueba
la financiación, los abonos, el reembolso y la anulación del comprobante.

Para la comparación de rendimiento de descargas simultáneas, sigue el
[procedimiento de carga A14](../../../../docs/A14_OPERACION_Y_CARGA.md#finanzas-y-exportaciones)
y usa el [contrato de B17](../../../../test/carga/contrato-b17.mjs).
