import { randomUUID } from 'node:crypto';
import { IdentidadService } from '@app/identidad';
import { MembresiasPersonalService } from '@app/negocios';
import {
  AsignacionesRolService,
  PermisosService,
  RolesNegocioService,
  type CodigoPermisoTienda,
} from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditoriaEscrituraService,
  type OperacionAuditada,
} from '../auditoria/auditoria-escritura';
import type { ContextoTienda } from '../auth';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import type {
  AltaPersonalDto,
  CrearRolTiendaDto,
  EditarRolTiendaDto,
  EstadoPersonalDto,
  ListaPersonalDto,
  PerfilPersonalDto,
  VincularPersonalDto,
} from './dto/acceso.dto';
import { PreparacionTiendaService } from './preparacion-tienda.service';

const lectura = 'store.staff.read';
const escritura = 'store.staff.write';
const gestion = 'store.roles.manage';
const alta = [escritura, gestion] as const;
const ficha = [lectura, escritura] as const;
const perfilBase = 'EMPLEADO';
const rolSelect = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
} satisfies Prisma.RolNegocioSelect;
const personalSelect = {
  id: true,
  usuarioId: true,
  estado: true,
  usuario: { select: { nombres: true, apellidos: true } },
  asignacionRol_membresia: { select: { rol: { select: rolSelect } } },
} satisfies Prisma.UserTenantSelect;

type Personal = Prisma.UserTenantGetPayload<{ select: typeof personalSelect }>;
type Requeridos = CodigoPermisoTienda | readonly CodigoPermisoTienda[];

@Injectable()
export class AccesosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identidad: IdentidadService,
    private readonly membresias: MembresiasPersonalService,
    private readonly permisos: PermisosService,
    private readonly asignaciones: AsignacionesRolService,
    private readonly roles: RolesNegocioService,
    private readonly preparacion: PreparacionTiendaService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  preparar(contexto: ContextoTienda) {
    return this.escribir(contexto, async (tx) => {
      const resultado = await this.preparacion.preparar(contexto, tx);
      if (
        resultado.rolesCreados ||
        resultado.asignacionesCreadas ||
        resultado.permisosAgregados
      ) {
        await this.auditar(tx, contexto, {
          accion: 'ACCESOS_ROLES_PREPARAR',
          entidadTipo: 'Tenant',
          entidadId: contexto.tenantId,
          datos: {
            rolesCreados: resultado.rolesCreados,
            asignacionesCreadas: resultado.asignacionesCreadas,
            permisosAgregados: resultado.permisosAgregados,
          },
        });
      }
      return resultado;
    });
  }

  activar(contexto: ContextoTienda, motivo: string) {
    return this.escribir(contexto, async (tx) => {
      const resultado = await this.preparacion.activar(contexto, tx);
      await this.auditar(tx, contexto, {
        accion: 'ACCESOS_PERMISOS_ACTIVAR',
        entidadTipo: 'Tenant',
        entidadId: contexto.tenantId,
        motivo: motivo.trim(),
        datos: { modo: resultado.modo },
      });
      return resultado;
    });
  }

  listarPersonal(
    contexto: ContextoTienda,
    { q, estado, rolCodigo, pagina = 1, limite = 20 }: ListaPersonalDto = {},
  ) {
    const skip = (pagina - 1) * limite;
    if (skip > MAX_PRISMA_INT)
      throw new BadRequestException('La página está fuera de rango');
    return this.leer(contexto, lectura, async (tx) => {
      const busqueda = q?.trim();
      const where: Prisma.UserTenantWhereInput = {
        tenantId: contexto.tenantId,
        estado,
        ...(rolCodigo && {
          asignacionRol_membresia: { some: { rol: { codigo: rolCodigo } } },
        }),
        ...(busqueda && {
          AND: busqueda.split(/\s+/).map((texto) => ({
            usuario: {
              OR: [
                { nombres: { contains: texto, mode: 'insensitive' } },
                { apellidos: { contains: texto, mode: 'insensitive' } },
              ],
            },
          })),
        }),
      };
      const [filas, total] = await Promise.all([
        tx.userTenant.findMany({
          where,
          select: personalSelect,
          skip,
          take: limite,
          orderBy: [
            { usuario: { apellidos: 'asc' } },
            { usuario: { nombres: 'asc' } },
            { id: 'asc' },
          ],
        }),
        tx.userTenant.count({ where }),
      ]);
      return {
        data: filas.map((fila) => this.personal(fila)),
        meta: { pagina, limite, total, paginas: Math.ceil(total / limite) },
      };
    });
  }

  resumenPersonal(contexto: ContextoTienda) {
    return this.leer(contexto, lectura, async (tx) => {
      const { tenantId } = contexto;
      const [grupos, total] = await Promise.all([
        tx.asignacionRol.groupBy({
          by: ['rolId'],
          where: {
            tenantId,
            membresia: { estado: 'ACTIVO' },
            rol: { activo: true },
          },
          _count: { _all: true },
        }),
        tx.userTenant.count({ where: { tenantId, estado: 'ACTIVO' } }),
      ]);
      const porRol = new Map(
        grupos.map(({ rolId, _count }) => [rolId, _count._all]),
      );
      const roles = await tx.rolNegocio.findMany({
        where: { tenantId, id: { in: [...porRol.keys()] } },
        select: rolSelect,
        orderBy: { codigo: 'asc' },
      });
      return {
        total,
        sinRol:
          total - grupos.reduce((suma, grupo) => suma + grupo._count._all, 0),
        roles: roles.map((rol) => ({ ...rol, total: porRol.get(rol.id) ?? 0 })),
      };
    });
  }

  obtenerPersonal(contexto: ContextoTienda, membresiaId: number) {
    return this.leer(contexto, ficha, async (tx) => {
      const { tenantId } = contexto;
      const fila = await this.buscarPersonal(tx, tenantId, membresiaId);
      const perfil = await this.buscarPerfil(tx, tenantId, fila.usuarioId);
      return {
        ...this.personal(fila),
        perfil: perfil && {
          horario: perfil.horario,
          sueldo: perfil.sueldo.toFixed(2),
        },
      };
    });
  }

  altaPersonal(
    contexto: ContextoTienda,
    { rolId, cedula, email, nombres, apellidos, password }: AltaPersonalDto,
  ) {
    return this.escribir(contexto, async (tx) => {
      await this.permisos.autorizar(contexto, alta, tx);
      const identificadores = { cedula: cedula.trim(), email: email?.trim() };
      const coincidencias = await this.identidad.findConflicts(
        identificadores,
        tx,
      );
      if (coincidencias.usuarioPorCedula || coincidencias.usuarioPorEmail) {
        throw new ConflictException('La cuenta ya existe');
      }
      const cuenta = await this.identidad.createAccount(
        {
          ...identificadores,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          password,
        },
        tx,
      );
      return this.vincularConRol(
        tx,
        contexto,
        cuenta.id,
        rolId,
        'ACCESOS_PERSONAL_ALTA',
      );
    });
  }

  vincularPersonal(
    contexto: ContextoTienda,
    { cedula, email, rolId }: VincularPersonalDto,
  ) {
    return this.escribir(contexto, async (tx) => {
      const acceso = await this.permisos.exigirPermisos(contexto, alta, tx);
      if (!acceso.owner)
        throw new ForbiddenException(
          'Solo OWNER puede vincular una cuenta existente',
        );
      const { usuarioPorCedula, usuarioPorEmail } =
        await this.identidad.findConflicts(
          { cedula: cedula.trim(), email: email.trim() },
          tx,
        );
      if (!usuarioPorCedula || usuarioPorCedula.id !== usuarioPorEmail?.id) {
        throw new NotFoundException('No se encontró una cuenta con esos datos');
      }
      if (
        await this.membresias.buscar(usuarioPorCedula.id, contexto.tenantId, tx)
      ) {
        throw new ConflictException('La cuenta ya pertenece al negocio');
      }
      return this.vincularConRol(
        tx,
        contexto,
        usuarioPorCedula.id,
        rolId,
        'ACCESOS_PERSONAL_VINCULAR',
      );
    });
  }

  editarPerfil(
    contexto: ContextoTienda,
    membresiaId: number,
    { horario, sueldo }: PerfilPersonalDto,
  ) {
    return this.escribir(contexto, async (tx) => {
      const { membresia } = await this.asignaciones.verificarGestionMembresia(
        contexto,
        membresiaId,
        tx,
        ficha,
      );
      const { tenantId, usuarioId } = membresia;
      const datos = { horario: horario.trim(), sueldo: Number(sueldo) };
      const clave = { tenantId, usuarioId, tenantRole: perfilBase } as const;
      const perfil = await tx.staffProfile.upsert({
        where: { usuarioId_tenantId_tenantRole: clave },
        create: { ...clave, ...datos },
        update: datos,
      });
      await this.auditar(tx, contexto, {
        accion: 'ACCESOS_PERSONAL_PERFIL',
        entidadTipo: 'UserTenant',
        entidadId: membresiaId,
        datos: { perfilId: perfil.id, campos: ['horario', 'sueldo'] },
      });
      return {
        membresiaId,
        perfil: { horario: perfil.horario, sueldo: perfil.sueldo.toFixed(2) },
      };
    });
  }

  cambiarEstado(
    contexto: ContextoTienda,
    membresiaId: number,
    { estado, motivo, rolId }: EstadoPersonalDto,
  ) {
    if (rolId !== undefined && estado !== 'ACTIVO') {
      throw new BadRequestException(
        'El rol solo se indica al activar una membresía',
      );
    }
    return this.escribir(contexto, async (tx) => {
      const { membresia, actual } =
        await this.asignaciones.verificarGestionMembresia(
          contexto,
          membresiaId,
          tx,
          rolId === undefined ? escritura : alta,
        );
      if (
        estado === 'ACTIVO' &&
        (rolId === undefined || rolId === actual?.rolId) &&
        !actual?.rol.activo
      ) {
        throw new ConflictException('La membresía necesita un rol activo');
      }
      const cambiaRol = rolId !== undefined && rolId !== actual?.rolId;
      if (membresia.estado !== estado || cambiaRol) {
        await this.membresias.cambiarEstado(
          membresiaId,
          contexto.tenantId,
          estado,
          tx,
        );
        if (rolId !== undefined)
          await this.asignaciones.asignar(contexto, membresiaId, rolId, tx);
        await this.auditar(tx, contexto, {
          accion: 'ACCESOS_PERSONAL_ESTADO',
          entidadTipo: 'UserTenant',
          entidadId: membresiaId,
          motivo: motivo.trim(),
          datos: {
            estadoAnterior: membresia.estado,
            estado,
            ...(rolId !== undefined && { rolId }),
          },
        });
      }
      return this.personal(
        await this.buscarPersonal(tx, contexto.tenantId, membresiaId),
      );
    });
  }

  async listarRoles(contexto: ContextoTienda) {
    return this.leer(contexto, gestion, async (tx) => {
      const roles = await tx.rolNegocio.findMany({
        where: { tenantId: contexto.tenantId },
        select: {
          ...rolSelect,
          protegido: true,
          rolPermiso_rol: {
            where: { permiso: { modulo: 'STORE' } },
            select: { permiso: { select: { codigo: true } } },
          },
        },
        orderBy: { codigo: 'asc' },
      });
      return roles.map(({ rolPermiso_rol, ...rol }) => ({
        ...rol,
        permisos: rolPermiso_rol.map(({ permiso }) => permiso.codigo).sort(),
      }));
    });
  }

  crearRol(contexto: ContextoTienda, datos: CrearRolTiendaDto) {
    if (datos.codigo.trim().toUpperCase() === 'BODEGUERO') {
      throw new BadRequestException('Código de rol reservado');
    }
    return this.escribir(contexto, async (tx) => {
      await this.permisos.autorizar(contexto, gestion, tx);
      const rol = await this.roles.crear(contexto, datos, tx);
      await this.auditar(tx, contexto, {
        accion: 'ACCESOS_ROL_CREAR',
        entidadTipo: 'RolNegocio',
        entidadId: rol.id,
        datos: { codigo: rol.codigo, permisos: datos.permisos },
      });
      return rol;
    });
  }

  editarRol(
    contexto: ContextoTienda,
    rolId: number,
    cambios: EditarRolTiendaDto,
  ) {
    const campos = (['nombre', 'activo', 'permisos'] as const).filter(
      (campo) => cambios[campo] !== undefined,
    );
    if (campos.length === 0)
      throw new BadRequestException('Indica al menos un cambio del rol');
    return this.escribir(contexto, async (tx) => {
      await this.permisos.autorizar(contexto, gestion, tx);
      const rol = await this.roles.editar(contexto, rolId, cambios, tx);
      await this.auditar(tx, contexto, {
        accion: 'ACCESOS_ROL_EDITAR',
        entidadTipo: 'RolNegocio',
        entidadId: rolId,
        datos: { campos, ...cambios },
      });
      return rol;
    });
  }

  asignarRol(contexto: ContextoTienda, membresiaId: number, rolId: number) {
    return this.escribir(contexto, async (tx) => {
      await this.permisos.autorizar(contexto, gestion, tx);
      const asignacion = await this.asignaciones.asignar(
        contexto,
        membresiaId,
        rolId,
        tx,
      );
      await this.auditar(tx, contexto, {
        accion: 'ACCESOS_ROL_ASIGNAR',
        entidadTipo: 'UserTenant',
        entidadId: membresiaId,
        datos: { rolId },
      });
      return asignacion;
    });
  }

  private async vincularConRol(
    tx: Prisma.TransactionClient,
    contexto: ContextoTienda,
    usuarioId: number,
    rolId: number,
    accion: OperacionAuditada['accion'],
  ) {
    const { tenantId } = contexto;
    const membresia = await this.membresias.vincular(
      { tenantId, usuarioId, role: 'EMPLEADO', estado: 'ACTIVO' },
      tx,
    );
    await this.asignaciones.asignar(contexto, membresia.id, rolId, tx);
    await this.auditar(tx, contexto, {
      accion,
      entidadTipo: 'UserTenant',
      entidadId: membresia.id,
      datos: { usuarioId, rolId },
    });
    return this.personal(await this.buscarPersonal(tx, tenantId, membresia.id));
  }

  private async buscarPersonal(
    tx: Prisma.TransactionClient,
    tenantId: number,
    membresiaId: number,
  ) {
    const fila = await tx.userTenant.findUnique({
      where: { tenantId_id: { tenantId, id: membresiaId } },
      select: personalSelect,
    });
    if (!fila)
      throw new NotFoundException('Membresía no encontrada en el negocio');
    return fila;
  }

  private async buscarPerfil(
    tx: Prisma.TransactionClient,
    tenantId: number,
    usuarioId: number,
  ) {
    const select = { horario: true, sueldo: true } as const;
    return (
      (await tx.staffProfile.findUnique({
        where: {
          usuarioId_tenantId_tenantRole: {
            usuarioId,
            tenantId,
            tenantRole: perfilBase,
          },
        },
        select,
      })) ??
      tx.staffProfile.findFirst({
        where: { usuarioId, tenantId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select,
      })
    );
  }

  private personal(fila: Personal) {
    return {
      membresiaId: fila.id,
      usuarioId: fila.usuarioId,
      ...fila.usuario,
      estado: fila.estado,
      rolEfectivo: fila.asignacionRol_membresia[0]?.rol ?? null,
    };
  }

  private auditar(
    tx: Prisma.TransactionClient,
    contexto: ContextoTienda,
    operacion: Omit<OperacionAuditada, 'correlacionId'>,
  ) {
    return this.auditoria.registrar(tx, contexto, {
      ...operacion,
      correlacionId: randomUUID(),
    });
  }

  private leer<T>(
    contexto: ContextoTienda,
    requerido: Requeridos,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.autorizar(contexto, requerido, tx);
        return operacion(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async escribir<T>(
    contexto: ContextoTienda,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const tienda = await tx.tenant.findFirst({
            where: {
              id: contexto.tenantId,
              tipoNegocio: 'STORE',
              estado: 'ACTIVO',
              modules: {
                some: { module: 'STORE', activo: true },
                none: { module: 'GYM', activo: true },
              },
            },
            select: { id: true },
          });
          if (!tienda)
            throw new ForbiddenException(
              'La gestión requiere un negocio exclusivamente STORE',
            );
          return operacion(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'Ya existe un registro con esos datos en el ámbito solicitado',
          );
        if (error.code === 'P2034')
          throw new ConflictException(
            'Otro cambio de accesos coincidió con la operación. Reintenta.',
          );
      }
      throw error;
    }
  }
}
