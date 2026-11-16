import { Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContextoTienda } from '../auth';
import type { ContextoOperacionTienda } from '../comun/operacion-tienda';

export const ACCIONES_AUDITORIA = {
  ACCESOS_ROLES_PREPARAR: 'ACCESOS_ROLES_PREPARAR',
  ACCESOS_PERMISOS_ACTIVAR: 'ACCESOS_PERMISOS_ACTIVAR',
  ACCESOS_PERSONAL_ALTA: 'ACCESOS_PERSONAL_ALTA',
  ACCESOS_PERSONAL_VINCULAR: 'ACCESOS_PERSONAL_VINCULAR',
  ACCESOS_PERSONAL_PERFIL: 'ACCESOS_PERSONAL_PERFIL',
  ACCESOS_PERSONAL_ESTADO: 'ACCESOS_PERSONAL_ESTADO',
  ACCESOS_ROL_CREAR: 'ACCESOS_ROL_CREAR',
  ACCESOS_ROL_EDITAR: 'ACCESOS_ROL_EDITAR',
  ACCESOS_ROL_ASIGNAR: 'ACCESOS_ROL_ASIGNAR',
  CLIENTES_REGISTRAR: 'clientes.registrar',
  CLIENTES_EDITAR: 'clientes.editar',
  CLIENTES_DESACTIVAR: 'clientes.desactivar',
  CATEGORIAS_CREAR: 'catalogo.categorias.crear',
  CATEGORIAS_EDITAR: 'catalogo.categorias.editar',
  CATEGORIAS_DESACTIVAR: 'catalogo.categorias.desactivar',
  CATEGORIAS_REACTIVAR: 'catalogo.categorias.reactivar',
  PRODUCTOS_ASIGNAR_CATEGORIA: 'catalogo.productos.categoria.asignar',
  PRODUCTOS_DESASIGNAR_CATEGORIA: 'catalogo.productos.categoria.desasignar',
  INVENTARIO_ENTRADA: 'inventario.entrada',
  INVENTARIO_BAJA: 'inventario.baja',
  VENTAS_REGISTRAR: 'ventas.registrar',
  VENTAS_ANULAR: 'ventas.anular',
  CARTERA_ABONAR: 'cartera.abonar',
  CAJA_CONFIGURAR: 'caja.configurar',
  CAJA_ABRIR: 'caja.abrir',
  CAJA_MOVIMIENTO: 'caja.movimiento',
  CAJA_CERRAR: 'caja.cerrar',
  COBROS_REGISTRAR: 'cobros.registrar',
  COBROS_APLICAR: 'cobros.aplicar',
} as const;

export type AccionAuditoria =
  (typeof ACCIONES_AUDITORIA)[keyof typeof ACCIONES_AUDITORIA];

export type ContextoAuditoria = Pick<
  ContextoTienda,
  'tenantId' | 'usuarioId' | 'membresiaId' | 'rolEfectivo'
>;

export type OperacionAuditada = {
  accion: AccionAuditoria;
  entidadTipo: string;
  entidadId: number;
  correlacionId: string;
  motivo?: string;
  productoIds?: readonly number[];
  datos?: Prisma.InputJsonObject;
};

@Injectable()
export class AuditoriaEscrituraService {
  paraOperacion(
    contexto: ContextoAuditoria,
    correlacionId: string,
  ): ContextoOperacionTienda {
    const { tenantId, usuarioId, membresiaId, rolEfectivo } = contexto;
    const actor = {
      tenantId,
      usuarioId,
      membresiaId,
      rolEfectivo: { ...rolEfectivo },
    };
    return {
      tenantId,
      usuarioId,
      membresiaId,
      auditar: async (tx, evento) => {
        await this.registrar(tx, actor, {
          accion: evento.accion,
          entidadTipo: evento.recursoTipo,
          entidadId: evento.recursoId,
          productoIds: evento.productos,
          motivo: evento.motivo,
          datos: evento.datos,
          correlacionId: evento.correlacionId ?? correlacionId,
        });
      },
    };
  }

  registrar(
    tx: Prisma.TransactionClient,
    contexto: ContextoAuditoria,
    { productoIds, ...operacion }: OperacionAuditada,
  ) {
    const productos: (number | null)[] = productoIds?.length
      ? [...new Set(productoIds)]
      : [null];
    return tx.auditoriaOperacion.createMany({
      data: productos.map((productoId) => ({
        ...operacion,
        productoId,
        actor: 'USUARIO' as const,
        tenantId: contexto.tenantId,
        usuarioId: contexto.usuarioId,
        membresiaId: contexto.membresiaId,
        rolCodigo: contexto.rolEfectivo.codigo,
        rolNombre: contexto.rolEfectivo.nombre,
      })),
    });
  }
}

@Module({
  providers: [AuditoriaEscrituraService],
  exports: [AuditoriaEscrituraService],
})
export class AuditoriaEscrituraModule {}
