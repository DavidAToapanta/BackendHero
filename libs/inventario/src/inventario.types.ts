import { Prisma } from '@prisma/client';

export type OperacionInventario = {
  tenantId: number;
  responsableId: number;
  clave: string;
  correlacionId: string;
};

export type ResultadoDevolucionInventario = {
  movimientoDevolucionId: number;
  movimientoBajaId: number | null;
};

export type LoteEntrada = {
  codigo: string;
  cantidad: number;
  costoUnitario: Prisma.Decimal;
  vencimiento?: Date;
};

export type SeleccionLote = { loteId: number; cantidad: number };

export type LineaSalidaVenta = {
  productoId: number;
  cantidad: number;
  lotes: readonly SeleccionLote[];
};

export type LineaSalidaValidada = Omit<LineaSalidaVenta, 'lotes'> & {
  lotes: (SeleccionLote & {
    costoUnitario: Prisma.Decimal;
    costoTotal: Prisma.Decimal;
  })[];
};
