import { Prisma } from '@prisma/client';

export type OperacionInventario = {
  tenantId: number;
  responsableId: number;
  clave: string;
  correlacionId: string;
};

export type LoteEntrada = {
  codigo: string;
  cantidad: number;
  costoUnitario: Prisma.Decimal;
  vencimiento?: Date;
};

export type SeleccionLote = { loteId: number; cantidad: number };
