import { PermisosService, type CodigoPermisoTienda } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccesosService } from '../accesos/accesos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { ContextoTienda } from '../auth';
import { CajaService } from '../caja/caja.service';
import { CarteraService } from '../cartera/cartera.service';
import { periodoComercial } from '../comun/fecha-comercial';
import { ConsultaFinanzasService } from '../finanzas/consulta-finanzas.service';
import { InventarioService } from '../inventario/inventario.service';
import { ConsultaVentasService } from '../ventas/consulta-ventas.service';

const permisosBloque = {
  ventas: 'store.sales.analytics.read',
  cartera: 'store.receivables.read',
  caja: 'store.cash.read',
  finanzas: 'store.reports.read',
  inventario: 'store.inventory.read',
  personal: 'store.staff.read',
  actividad: 'store.audit.read',
} satisfies Record<string, CodigoPermisoTienda>;

type BloquePanel = keyof typeof permisosBloque;
type ResultadoBloque =
  | { estado: 'DISPONIBLE'; datos: unknown }
  | { estado: 'SIN_ACCESO' | 'ERROR' };

@Injectable()
export class ConsultaPanelService {
  private readonly logger = new Logger(ConsultaPanelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly ventas: ConsultaVentasService,
    private readonly cartera: CarteraService,
    private readonly caja: CajaService,
    private readonly finanzas: ConsultaFinanzasService,
    private readonly inventario: InventarioService,
    private readonly accesos: AccesosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async consultar(
    contexto: ContextoTienda,
    periodo: { desde: string; hasta: string },
  ) {
    periodoComercial(periodo);
    const { tenantId } = contexto;
    const acceso = await this.prisma.$transaction(
      (tx) => this.permisos.exigirPermisos(contexto, 'store.panel.read', tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const consultas: Record<BloquePanel, () => Promise<unknown>> = {
      ventas: () => this.ventas.analizar(tenantId, periodo, 'week'),
      cartera: async () => {
        const [resumen, cuentas, deudores] = await Promise.all([
          this.cartera.resumen(tenantId),
          this.cartera.listarPendientes(tenantId, {
            vencida: false,
            limite: 10,
          }),
          this.cartera.listarDeudores(tenantId, 1, 10),
        ]);
        return { ...resumen, cuentas, deudores };
      },
      caja: () => this.caja.listarDisponibilidad(tenantId, false, 20),
      finanzas: () => this.finanzas.consultar(tenantId, periodo),
      inventario: () =>
        this.inventario.listarProductos(contexto, { activo: true, limite: 10 }),
      personal: () => this.accesos.resumenPersonal(contexto),
      actividad: () => this.auditoria.actividadReciente(contexto),
    };
    const resultados = await Promise.all(
      (Object.keys(consultas) as BloquePanel[]).map(
        async (bloque): Promise<[BloquePanel, ResultadoBloque]> => {
          if (!acceso.owner && !acceso.permisos.has(permisosBloque[bloque])) {
            return [bloque, { estado: 'SIN_ACCESO' }];
          }
          try {
            return [
              bloque,
              { estado: 'DISPONIBLE', datos: await consultas[bloque]() },
            ];
          } catch (error) {
            if (error instanceof ForbiddenException)
              return [bloque, { estado: 'SIN_ACCESO' }];
            this.logger.warn(`Falló la consulta del bloque ${bloque}`);
            return [bloque, { estado: 'ERROR' }];
          }
        },
      ),
    );
    return Object.fromEntries(resultados);
  }
}
