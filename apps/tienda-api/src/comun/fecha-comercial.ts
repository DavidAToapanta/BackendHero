import { BadRequestException } from '@nestjs/common';

const calendario = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function fechaComercial(fecha: Date) {
  return calendario.format(fecha);
}

export function inicioFechaComercial(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new BadRequestException('La fecha debe usar AAAA-MM-DD');
  }
  const inicio = new Date(fecha + 'T00:00:00-05:00');
  if (
    !Number.isFinite(inicio.getTime()) ||
    inicio.toISOString().slice(0, 10) !== fecha
  ) {
    throw new BadRequestException('Fecha comercial inválida');
  }
  return inicio;
}

export function periodoComercial(periodo: { desde: string; hasta: string }) {
  const desde = inicioFechaComercial(periodo.desde);
  const hasta = inicioFechaComercial(periodo.hasta);
  if (hasta <= desde || hasta.getTime() - desde.getTime() > 366 * 86400000) {
    throw new BadRequestException('El período debe abarcar entre 1 y 366 días');
  }
  return { desde, hasta };
}
