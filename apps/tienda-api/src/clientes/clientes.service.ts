import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  conflictoUnicidad,
  ContextoOperacionTienda,
  paginacion,
  textoObligatorio,
} from '../comun/operacion-tienda';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

export interface FichaClienteComercial {
  nombres: string;
  apellidos?: string | null;
  razonSocial?: string | null;
  tipoIdentificacion?: string | null;
  identificacion?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  clienteGymId?: number | null;
}

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    contexto: ContextoOperacionTienda,
    ficha: FichaClienteComercial,
  ) {
    return this.guardar(contexto, ficha);
  }

  async editar(
    contexto: ContextoOperacionTienda,
    id: number,
    cambios: Partial<FichaClienteComercial>,
  ) {
    return this.guardar(contexto, cambios, id);
  }

  async desactivar(contexto: ContextoOperacionTienda, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const anterior = await this.bloquearFicha(tx, contexto.tenantId, id);
      if (!anterior.activo) return anterior;
      const cliente = await tx.clienteComercial.update({
        where: { tenantId_id: { tenantId: contexto.tenantId, id } },
        data: { activo: false },
      });
      await contexto.auditar(tx, {
        accion: 'clientes.desactivar',
        recursoTipo: 'ClienteComercial',
        recursoId: id,
      });
      return cliente;
    });
  }

  async listar(
    tenantId: number,
    filtros: {
      buscar?: string;
      activo?: boolean;
      pagina?: number;
      limite?: number;
    } = {},
  ) {
    const buscado = filtros.buscar?.trim().replace(/[\\%_]/g, '\\$&');
    return this.prisma.clienteComercial.findMany({
      where: {
        tenantId,
        activo: filtros.activo,
        OR: buscado
          ? [
              { nombres: { contains: buscado, mode: 'insensitive' } },
              { apellidos: { contains: buscado, mode: 'insensitive' } },
              { razonSocial: { contains: buscado, mode: 'insensitive' } },
              { identificacion: { contains: buscado, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: [{ nombres: 'asc' }, { id: 'asc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }

  async obtener(
    tenantId: number,
    id: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ficha = await tx.clienteComercial.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!ficha) throw new NotFoundException('Cliente comercial no encontrado');
    return ficha;
  }

  async obtenerActivo(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const ficha = await this.bloquearFicha(tx, tenantId, id);
    if (!ficha.activo)
      throw new ConflictException('El cliente comercial está inactivo');
    return ficha;
  }

  private async bloquearFicha(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "ClienteComercial" WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!filas.length)
      throw new NotFoundException('Cliente comercial no encontrado');
    return this.obtener(tenantId, id, tx);
  }

  private async guardar(
    contexto: ContextoOperacionTienda,
    ficha: Partial<FichaClienteComercial>,
    id?: number,
  ) {
    const { tenantId } = contexto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const anterior =
          id === undefined ? null : await this.bloquearFicha(tx, tenantId, id);
        const nombres = textoObligatorio(
          ficha.nombres ?? anterior?.nombres ?? '',
          'Nombres',
        );
        const opcional = (valor?: string | null) =>
          valor === undefined ? undefined : valor?.trim() || null;
        const tipoIdentificacion = opcional(
          ficha.tipoIdentificacion,
        )?.toUpperCase();
        const identificacion = opcional(ficha.identificacion);
        const tipoFinal =
          ficha.tipoIdentificacion === undefined
            ? anterior?.tipoIdentificacion
            : tipoIdentificacion;
        const idFinal =
          ficha.identificacion === undefined
            ? anterior?.identificacion
            : identificacion;
        if (Boolean(tipoFinal) !== Boolean(idFinal)) {
          throw new BadRequestException(
            'Indique tipo y número de identificación juntos',
          );
        }
        if (ficha.clienteGymId != null) {
          const clienteGym = await tx.cliente.findUnique({
            where: { tenantId_id: { tenantId, id: ficha.clienteGymId } },
            select: { id: true },
          });
          if (!clienteGym)
            throw new NotFoundException(
              'Cliente de Gym no encontrado en el negocio',
            );
        }
        const datos = {
          nombres,
          apellidos: opcional(ficha.apellidos),
          razonSocial: opcional(ficha.razonSocial),
          tipoIdentificacion:
            ficha.tipoIdentificacion === undefined
              ? undefined
              : (tipoIdentificacion ?? null),
          identificacion,
          email: opcional(ficha.email),
          telefono: opcional(ficha.telefono),
          direccion: opcional(ficha.direccion),
          clienteGymId: ficha.clienteGymId,
        };
        const cliente =
          id === undefined
            ? await tx.clienteComercial.create({ data: { ...datos, tenantId } })
            : await tx.clienteComercial.update({
                where: { tenantId_id: { tenantId, id } },
                data: datos,
              });
        await contexto.auditar(tx, {
          accion: id === undefined ? 'clientes.registrar' : 'clientes.editar',
          recursoTipo: 'ClienteComercial',
          recursoId: cliente.id,
        });
        return cliente;
      });
    } catch (error) {
      conflictoUnicidad(
        error,
        'La identificación o el cliente de Gym ya está vinculado',
      );
    }
  }

  create(createClienteDto: CreateClienteDto): never {
    void createClienteDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateClienteDto: UpdateClienteDto): never {
    void id;
    void updateClienteDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
