# B01 · Idempotencia de Tienda

## Contrato K06 v1

Importar `IdempotenciaModule` en el módulo consumidor e inyectar
`IdempotenciaService` en el servicio que coordina la operación. El consumidor
verifica el acceso antes de llamar a `ejecutar`, también en los reintentos.
`tenantId` y `usuarioId` salen de ese contexto verificado. La cabecera
`Idempotency-Key` contiene entre 1 y 128 caracteres ASCII visibles. En un
reintento, el cliente conserva la clave que envió en la solicitud original.

La clave se reclama por tenant, actor (`usuario:<Usuario.id>`) y operación.
Usar un nombre de operación fijo en el servidor. Los datos del hash deben
incluir todos los parámetros que cambian el resultado, incluidos los IDs de
la ruta. Pasar JSON plano, ordenar o normalizar en el consumidor los valores
equivalentes para esa operación y representar importes con cadenas decimales
y fechas con cadenas ISO. B01 ordena las propiedades de los objetos de forma
recursiva y conserva el orden de los arreglos. La tabla guarda el hash SHA-256
y la referencia al recurso.

`ejecutar` abre la transacción y entrega el mismo `tx` para el recurso, sus
movimientos y la auditoría. La clave derivada `claveRecurso` es estable y
combina tenant, actor, operación y clave HTTP. Usarla en `claveIdempotencia`
de entidades como `Venta` y `EntradaInventario`, cuya unicidad abarca toda la
tienda. Si una misma operación crea varios registros del mismo tipo que
requieren una clave única por tenant, añadir a `claveRecurso` un sufijo estable
para cada registro. El callback usa el `tx` recibido para todas las escrituras
y registra los efectos externos como eventos de salida en esa transacción.

### Ejemplo para A09

`datosNormalizados` incluye `productoId`, motivo y todos los campos de los
lotes que determinan la entrada. `lotes` contiene esos mismos datos convertidos
a los tipos que recibe `InventarioLotesService`.

```ts
return this.idempotencia.ejecutar(
  {
    tenantId: contexto.tenantId,
    usuarioId: contexto.usuarioId,
    operacion: 'inventario.entrada',
    clave: idempotencyKey,
    datos: datosNormalizados,
  },
  async (tx, claveRecurso) => {
    const { entrada } = await this.inventarioLotes.registrarEntrada(
      tx,
      {
        tenantId: contexto.tenantId,
        responsableId: contexto.membresiaId,
        clave: claveRecurso,
        correlacionId,
      },
      productoId,
      'ENTRADA',
      motivo,
      lotes,
    );
    // Aquí va la escritura de auditoría de A05 con el mismo tx.
    return { recursoTipo: 'EntradaInventario', recursoId: entrada.id };
  },
);
```

Para A10 se usa el mismo contrato con un nombre de operación propio y la
referencia que produzca la baja.

### Resultado y reintentos

- Una clave nueva devuelve `{ recursoTipo, recursoId }` después de confirmar la
  transacción. La misma clave con el mismo contenido devuelve esa referencia
  sin ejecutar el callback. Si el contrato HTTP requiere más campos, consultar
  con el tenant autorizado los datos históricos del recurso y devolver la misma
  forma de respuesta en ambos casos.
- Una clave ausente o inválida produce `400`. Una clave reutilizada con otro
  contenido produce `409`. Si existe un registro previo persistido en estado
  `EN_PROCESO`, se responde `409` y se conserva ese registro.
- Un envío simultáneo espera la decisión de PostgreSQL sobre la clave. Tras un
  commit lee la referencia confirmada. Si la primera transacción falla, su
  clave y sus escrituras se revierten juntas y otro envío puede reclamarla.
  Ante un error transitorio de base de datos, reintentar con la misma clave.

### Prueba de cierre

Aplicar las migraciones vigentes a una base PostgreSQL de ensayo llamada
`hero_tienda_idempotencia_test` en `127.0.0.1` y apuntar `DATABASE_URL` a ella.
En PowerShell, ejecutar:

```powershell
$env:TIENDA_IDEMPOTENCIA_POSTGRES_E2E = '1'
npm run test:e2e -- --runInBand tienda-idempotencia-postgres
```
