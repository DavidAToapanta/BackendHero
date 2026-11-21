import { PickType } from '@nestjs/mapped-types';
import { CreateDevolucionDto } from './create-devolucion.dto';

export class VistaPreviaDevolucionDto extends PickType(CreateDevolucionDto, [
  'lineas',
] as const) {}

/** Consulta orientativa: liberar una aplicación no implica reembolsar dinero. */
export interface VistaPreviaDevolucion {
  ventaId: number;
  subtotal: string;
  descuento: string;
  impuesto: string;
  total: string;
  saldoPendiente: string;
  reduccionSaldoSugerida: string;
  importeALiberar: string;
  liberarSugerido: { aplicacionId: number; monto: string }[];
}
