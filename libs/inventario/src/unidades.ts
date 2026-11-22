import type { UnidadVenta } from '@prisma/client';

// Los saldos y sus restricciones usan enteros. Una libra equivale a mil partes.
export function factorCantidad(unidad: UnidadVenta | undefined) {
  return unidad === 'LIBRA' ? 1000 : 1;
}

export function mostrarCantidad(cantidad: number, unidad: UnidadVenta) {
  return (
    String(cantidad / factorCantidad(unidad)) +
    (unidad === 'LIBRA' ? ' lb' : '')
  );
}
