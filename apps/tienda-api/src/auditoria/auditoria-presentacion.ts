import type { Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from './auditoria-escritura';

export const resumenSelect = {
  createdAt: true,
  correlacionId: true,
  accion: true,
  actor: true,
  usuarioId: true,
  membresiaId: true,
  rolCodigo: true,
  rolNombre: true,
  usuario: { select: { nombres: true, apellidos: true } },
} satisfies Prisma.AuditoriaOperacionSelect;

type FilaResumen = Prisma.AuditoriaOperacionGetPayload<{
  select: typeof resumenSelect;
}>;
type FilaDetalle = FilaResumen &
  Pick<
    Prisma.AuditoriaOperacionGetPayload<object>,
    'entidadTipo' | 'entidadId' | 'motivo' | 'datos' | 'productoId'
  >;

export function resumirOperacion(fila: FilaResumen) {
  const nombre = fila.usuario
    ? `${fila.usuario.nombres} ${fila.usuario.apellidos}`.trim()
    : null;
  return {
    correlacionId: fila.correlacionId,
    fecha: fila.createdAt,
    accion: fila.accion,
    actor: {
      tipo: fila.actor,
      usuarioId: fila.usuarioId,
      membresiaId: fila.membresiaId,
      nombre: nombre || null,
    },
    rol:
      fila.rolCodigo === null && fila.rolNombre === null
        ? null
        : { codigo: fila.rolCodigo, nombre: fila.rolNombre },
  };
}

export function detallarOperacion(ultima: FilaDetalle, filas: FilaDetalle[]) {
  const eventos = new Map<string, ReturnType<typeof presentarEvento>>();
  const productoIds = new Set<number>();
  for (const fila of filas) {
    const clave = JSON.stringify([
      fila.accion,
      fila.entidadTipo,
      fila.entidadId,
    ]);
    let evento = eventos.get(clave);
    if (!evento) {
      evento = presentarEvento(fila);
      eventos.set(clave, evento);
    }
    if (fila.productoId !== null) {
      evento.productoIds.add(fila.productoId);
      productoIds.add(fila.productoId);
    }
  }
  return {
    ...resumirOperacion(ultima),
    productoIds: [...productoIds].sort((a, b) => a - b),
    eventos: [...eventos.values()].map((evento) => ({
      ...evento,
      productoIds: [...evento.productoIds].sort((a, b) => a - b),
    })),
  };
}

function presentarEvento(fila: FilaDetalle) {
  const { fecha, accion, actor, rol } = resumirOperacion(fila);
  return {
    fecha,
    accion,
    actor,
    rol,
    entidad: { tipo: fila.entidadTipo, id: fila.entidadId },
    motivo: fila.motivo,
    datos: datosPublicos(accion, fila.datos),
    productoIds: new Set<number>(),
  };
}

const entero = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isSafeInteger(valor);
const positivo = (valor: unknown): valor is number =>
  entero(valor) && valor > 0;

function datosPublicos(accion: string, datos: Prisma.JsonValue) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
  switch (accion) {
    case ACCIONES_AUDITORIA.INVENTARIO_ENTRADA:
      return {
        tipo:
          datos.tipo === 'APERTURA' || datos.tipo === 'ENTRADA'
            ? datos.tipo
            : undefined,
        loteIds: Array.isArray(datos.loteIds)
          ? datos.loteIds.filter(positivo)
          : undefined,
      };
    case ACCIONES_AUDITORIA.INVENTARIO_BAJA:
      return {
        loteId: positivo(datos.loteId) ? datos.loteId : undefined,
        cantidad: positivo(datos.cantidad) ? datos.cantidad : undefined,
      };
    case ACCIONES_AUDITORIA.INVENTARIO_AJUSTE:
      return {
        loteId: positivo(datos.loteId) ? datos.loteId : undefined,
        delta: entero(datos.delta) ? datos.delta : undefined,
      };
    case ACCIONES_AUDITORIA.VENTAS_REGISTRAR:
      return {
        turnoId: positivo(datos.turnoId) ? datos.turnoId : undefined,
        modalidad:
          datos.modalidad === 'CREDITO' || datos.modalidad === 'CONTADO'
            ? datos.modalidad
            : undefined,
      };
    default:
      return null;
  }
}
