import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import writeXlsxFile from 'write-excel-file/node';
import { CajaService } from '../caja/caja.service';
import { archivoPdf } from '../comun/documentos/archivo-pdf';
import { ConsultaVentasService } from '../ventas/consulta-ventas.service';
import { ConsultaFinanzasService } from '../finanzas/consulta-finanzas.service';

type Celda = string | number;
type Hoja = { titulo: string; encabezados: string[]; filas: Celda[][] };
export type Formato = 'xlsx' | 'pdf';
type Periodo = { desde: string; hasta: string };

function moneda(importe: Prisma.Decimal, decimales = 2): Celda {
  const exacto = importe.toFixed(decimales);
  return importe.precision() <= 15 ? Number(exacto) : exacto;
}

@Injectable()
export class ExportacionesTiendaService {
  constructor(
    private readonly finanzas: ConsultaFinanzasService,
    private readonly ventas: ConsultaVentasService,
  ) {}

  async exportarFinanzas(tenantId: number, periodo: Periodo, formato: Formato) {
    const datos = await this.finanzas.consultar(tenantId, periodo);
    const resumen: Hoja = {
      titulo: 'Finanzas',
      encabezados: ['Concepto', 'Importe'],
      filas: [
        ['Ventas netas', moneda(datos.ventasNetas)],
        ['Costo neto vendido', moneda(datos.costoNetoVendido, 4)],
        ['Utilidad bruta', moneda(datos.utilidadBruta, 4)],
        ['Dinero recibido', moneda(datos.dineroRecibido)],
        ['Dinero devuelto', moneda(datos.dineroDevuelto)],
        ['Flujo de cobros', moneda(datos.flujoCobros)],
        ['Gastos comerciales', moneda(datos.gastosComerciales)],
        ['Pérdidas de inventario', moneda(datos.perdidasInventario, 4)],
        [
          'Resultado operativo estimado',
          moneda(datos.resultadoOperativoEstimado, 4),
        ],
      ],
    };
    return this.generar('Reporte de finanzas', formato, [
      this.periodo(periodo),
      resumen,
    ]);
  }

  async exportarVentas(
    tenantId: number,
    filtros: Parameters<ConsultaVentasService['analizar']>[1],
    granularidad: 'week' | 'month',
    formato: Formato,
  ) {
    const datos = await this.ventas.analizar(tenantId, filtros, granularidad);
    const criterios = this.periodo(filtros);
    criterios.filas.push(
      ['Agrupación', granularidad === 'week' ? 'Semana' : 'Mes'],
      ['Cajero', filtros.cajeroId ?? 'Todos'],
      ['Categoría', filtros.categoriaId ?? 'Todas'],
      ['Producto', filtros.productoId ?? 'Todos'],
    );
    return this.generar('Reporte de ventas', formato, [
      criterios,
      {
        titulo: 'Resumen',
        encabezados: ['Concepto', 'Resultado'],
        filas: [
          ['Ventas', datos.ventas],
          ['Ventas netas', moneda(datos.neto)],
          ['Ticket promedio', moneda(datos.ticketPromedio)],
        ],
      },
      {
        titulo: 'Tendencia',
        encabezados: ['Período', 'Ventas', 'Neto'],
        filas: datos.series.map((fila) => [
          fila.periodo,
          fila.ventas,
          moneda(fila.neto),
        ]),
      },
      {
        titulo: 'Productos',
        encabezados: ['Producto', 'Cantidad neta', 'Neto', 'Unidad'],
        filas: datos.productos.map((fila) => [
          fila.productoId,
          fila.unidades,
          moneda(fila.neto),
          fila.unidadVenta === 'LIBRA' ? 'lb' : 'unidad',
        ]),
      },
      {
        titulo: 'Cajeros',
        encabezados: ['Cajero', 'Ventas', 'Neto'],
        filas: datos.cajeros.map((fila) => [
          fila.responsableId,
          fila.ventas,
          moneda(fila.neto),
        ]),
      },
    ]);
  }

  async exportarCierre(
    turno: Awaited<ReturnType<CajaService['obtenerTurno']>>,
    formato: Formato,
  ) {
    if (
      !turno.cierreAt ||
      turno.efectivoEsperado === null ||
      turno.efectivoContado === null ||
      turno.diferencia === null
    ) {
      throw new ConflictException('El reporte requiere un turno cerrado');
    }
    return this.generar('Cierre de caja', formato, [
      {
        titulo: 'Cierre',
        encabezados: ['Concepto', 'Valor'],
        filas: [
          ['Turno', turno.id],
          ['Caja', turno.cajaId],
          ['Cajero', turno.cajeroId],
          ['Apertura (UTC)', turno.aperturaAt.toISOString()],
          ['Cierre (UTC)', turno.cierreAt.toISOString()],
          ['Fondo inicial', moneda(turno.fondoInicial)],
          ['Efectivo esperado', moneda(turno.efectivoEsperado)],
          ['Efectivo contado', moneda(turno.efectivoContado)],
          ['Diferencia', moneda(turno.diferencia)],
        ],
      },
    ]);
  }

  private periodo(periodo: Periodo): Hoja {
    return {
      titulo: 'Filtros',
      encabezados: ['Filtro', 'Valor'],
      filas: [
        ['Desde', periodo.desde],
        ['Hasta (exclusivo)', periodo.hasta],
        ['Zona horaria', 'America/Guayaquil'],
      ],
    };
  }

  private async generar(titulo: string, formato: Formato, hojas: Hoja[]) {
    if (formato === 'pdf') {
      return {
        contenido: await archivoPdf(
          titulo,
          hojas.map((hoja) => ({
            titulo: hoja.titulo,
            lineas: hoja.filas.map((fila) =>
              fila
                .map(
                  (valor, indice) => hoja.encabezados[indice] + ' · ' + valor,
                )
                .join('   |   '),
            ),
          })),
        ),
        contentType: 'application/pdf',
      };
    }
    const contenido = await writeXlsxFile(
      hojas.map(({ titulo, encabezados, filas }) => ({
        sheet: titulo,
        stickyRowsCount: 1,
        columns: encabezados.map((_, indice) => ({
          width: indice === 0 ? 35 : 23,
        })),
        data: [
          encabezados.map((value) => ({ value, fontWeight: 'bold' as const })),
          ...filas,
        ],
      })),
    ).toBuffer();
    return {
      contenido,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
