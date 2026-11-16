# B16 · Panel administrativo

`GET /panel?desde=2026-05-01&hasta=2026-06-01` requiere `store.panel.read`.
Las fechas son días comerciales de Guayaquil. El inicio es inclusivo y el
fin exclusivo. El rango permitido es de 1 a 366 días.

| Bloque | Permiso adicional | Fuente y alcance |
| --- | --- | --- |
| `ventas` | `store.sales.analytics.read` | [B14](../ventas/B14.md), tendencias semanales y totales del intervalo. |
| `cartera` | `store.receivables.read` | [B08](../cartera/README.md), saldos al día, 10 cuentas vigentes por vencimiento y 10 deudores por saldo. |
| `caja` | `store.cash.read` | [B04](../caja/README.md), disponibilidad de las primeras 20 cajas por código. |
| `finanzas` | `store.reports.read` | [B15](../finanzas/README.md#b15--resumen-financiero), cifras reconocidas en el intervalo. |
| `inventario` | `store.inventory.read` | [A08](../inventario/README.md), primera página de 10 productos activos por nombre, con stock y sin costos. |
| `personal` | `store.staff.read` | [A04](../accesos/README.md#personal-y-roles), membresías activas agrupadas por rol y total sin rol. |
| `actividad` | `store.audit.read` | [A12](../auditoria/README.md), últimas 10 operaciones, cualquiera que sea el intervalo de ventas. |

Cada bloque devuelve su estado. Un bloque disponible incluye `datos`,
también cuando los importes son cero o la lista está vacía. Los bloques
`SIN_ACCESO` y `ERROR` solo devuelven su estado. Un fallo en una fuente
permite mostrar las demás. El negocio se toma de la sesión.

Por ejemplo, un operador con acceso al panel y a caja puede recibir
`"caja": {"estado":"DISPONIBLE","datos":[]}` y
`"finanzas": {"estado":"SIN_ACCESO"}`. El propietario de la tienda recibe
los siete bloques disponibles cuando responden sus fuentes.
