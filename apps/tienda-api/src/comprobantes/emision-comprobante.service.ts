import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import { archivoPdf } from '../comun/documentos/archivo-pdf';
import { ContextoOperacionTienda, paginacion } from '../comun/operacion-tienda';

@Injectable()
export class EmisionComprobanteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cobros: CobrosOperacionService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  emitir(
    contexto: ContextoOperacionTienda,
    ventaId: number,
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'comprobantes.emitir',
        datos: { ventaId },
      },
      async (tx) => {
        const venta = await this.cobros.bloquearVenta(tx, tenantId, ventaId);
        const existente = await tx.comprobanteVenta.findUnique({
          where: { tenantId_ventaId: { tenantId, ventaId } },
          select: { id: true },
        });
        if (existente)
          return { recursoTipo: 'ComprobanteVenta', recursoId: existente.id };
        if (venta.estado !== 'COMPLETADA')
          throw new ConflictException('La venta está anulada');
        const cliente =
          venta.clienteComercialId === null
            ? null
            : await tx.clienteComercial.findUniqueOrThrow({
                where: {
                  tenantId_id: { tenantId, id: venta.clienteComercialId },
                },
              });
        const detalles = await tx.detalleVenta.findMany({
          where: { tenantId, ventaId },
          orderBy: { id: 'asc' },
        });
        const [{ consecutivo }] = await tx.$queryRaw<{ consecutivo: bigint }[]>`
          INSERT INTO "SecuenciaComprobante" ("tenantId", "ultimoConsecutivo", "updatedAt")
          VALUES (${tenantId}, 1, CURRENT_TIMESTAMP)
          ON CONFLICT ("tenantId") DO UPDATE SET
            "ultimoConsecutivo" = "SecuenciaComprobante"."ultimoConsecutivo" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING "ultimoConsecutivo" AS consecutivo
        `;
        const comprobante = await tx.comprobanteVenta.create({
          data: {
            tenantId,
            ventaId,
            consecutivo,
            numero: 'COMP-' + consecutivo.toString(),
            clienteComercialId: venta.clienteComercialId,
            emitidoPorId: membresiaId,
            receptorNombre: cliente
              ? cliente.razonSocial ||
                [cliente.nombres, cliente.apellidos].filter(Boolean).join(' ')
              : 'Consumidor final',
            receptorIdentificacion: cliente?.identificacion,
            receptorTipoIdentificacion: cliente?.tipoIdentificacion,
            receptorEmail: cliente?.email,
            receptorDireccion: cliente?.direccion,
            subtotal: venta.subtotal,
            descuento: venta.descuento,
            impuesto: venta.impuesto,
            total: venta.total,
          },
        });
        await tx.detalleComprobanteVenta.createMany({
          data: detalles.map((detalle) => ({
            tenantId,
            comprobanteId: comprobante.id,
            detalleVentaId: detalle.id,
            ventaId,
            productoId: detalle.productoId,
            nombreProducto: detalle.nombreProducto,
            presentacionProducto: detalle.presentacionProducto,
            skuProducto: detalle.skuProducto,
            codigoBarrasProducto: detalle.codigoBarrasProducto,
            categoriaNombre: detalle.categoriaNombre,
            cantidad: detalle.cantidad,
            precioUnitario: detalle.precioUnitario,
            descuento: detalle.descuento,
            tasaImpuesto: detalle.tasaImpuesto,
            subtotal: detalle.subtotal,
            impuesto: detalle.impuesto,
            total: detalle.total,
          })),
        });
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.COMPROBANTES_EMITIR,
          recursoTipo: 'ComprobanteVenta',
          recursoId: comprobante.id,
        });
        return { recursoTipo: 'ComprobanteVenta', recursoId: comprobante.id };
      },
    );
  }

  async obtener(tenantId: number, id: number) {
    const comprobante = await this.prisma.comprobanteVenta.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: {
        detalleComprobanteVenta_comprobante: { orderBy: { id: 'asc' } },
      },
    });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado');
    return { ...comprobante, consecutivo: comprobante.consecutivo.toString() };
  }

  async listar(tenantId: number, pagina?: number, limite?: number) {
    const comprobantes = await this.prisma.comprobanteVenta.findMany({
      where: { tenantId },
      orderBy: { consecutivo: 'desc' },
      ...paginacion(pagina, limite),
    });
    return comprobantes.map((item) => ({
      ...item,
      consecutivo: item.consecutivo.toString(),
    }));
  }

  async descargarPdf(tenantId: number, id: number) {
    const documento = await this.obtener(tenantId, id);
    return archivoPdf('Comprobante interno ' + documento.numero, [
      {
        lineas: [
          'Estado · ' + documento.estado,
          'Emitido · ' +
            documento.fechaEmision.toLocaleString('es-EC', {
              timeZone: 'America/Guayaquil',
            }),
          'Receptor · ' + documento.receptorNombre,
          ...(documento.receptorIdentificacion
            ? ['Identificación · ' + documento.receptorIdentificacion]
            : []),
          ...(documento.receptorDireccion
            ? ['Dirección · ' + documento.receptorDireccion]
            : []),
        ],
      },
      {
        titulo: 'Detalle',
        lineas: documento.detalleComprobanteVenta_comprobante.map(
          (linea) =>
            linea.nombreProducto +
            '  |  ' +
            linea.cantidad +
            ' × $' +
            linea.precioUnitario.toFixed(2) +
            '  |  $' +
            linea.total.toFixed(2),
        ),
      },
      {
        titulo: 'Totales',
        lineas: [
          'Subtotal · $' + documento.subtotal.toFixed(2),
          'Descuento · $' + documento.descuento.toFixed(2),
          'Impuesto · $' + documento.impuesto.toFixed(2),
          'Total · $' + documento.total.toFixed(2),
        ],
      },
    ]);
  }
}
