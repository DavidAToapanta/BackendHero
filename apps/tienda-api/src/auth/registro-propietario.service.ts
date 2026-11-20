import { randomUUID } from 'node:crypto';
import { IdentidadService } from '@app/identidad';
import { NegociosService } from '@app/negocios';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PreparacionTiendaService } from '../accesos/preparacion-tienda.service';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../auditoria/auditoria-escritura';
import { AuthService } from './auth.service';
import type { AccesoTienda } from './auth.types';
import type { RegistroPropietarioDto } from './dto/registro-propietario.dto';

@Injectable()
export class RegistroPropietarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identidad: IdentidadService,
    private readonly negocios: NegociosService,
    private readonly preparacion: PreparacionTiendaService,
    private readonly auditoria: AuditoriaEscrituraService,
    private readonly auth: AuthService,
  ) {}

  async registrar(dto: RegistroPropietarioDto): Promise<AccesoTienda> {
    const nombre = dto.tenantNombre.trim();
    const slug = (dto.tenantSlug ?? nombre)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug)
      throw new BadRequestException('El slug de la tienda es inválido');

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const propietario = await this.resolverPropietario(dto, tx);
          const tienda = await this.negocios.crear(
            {
              nombre,
              slug,
              tipoNegocio: 'STORE',
              estado: 'ACTIVO',
              telefono: dto.telefono?.trim() || null,
              direccion: dto.direccion?.trim() || null,
              ciudad: dto.ciudad?.trim() || null,
              pais: dto.pais?.trim() || null,
            },
            { inicial: { modulos: ['STORE'], propietarioId: propietario }, tx },
          );

          const contextoInicial = await this.contexto(
            propietario,
            tienda.id,
            tx,
          );
          await this.preparacion.preparar(contextoInicial, tx);
          const contextoPreparado = await this.contexto(
            propietario,
            tienda.id,
            tx,
          );
          await this.preparacion.activar(contextoPreparado, tx);

          const contexto = await this.contexto(propietario, tienda.id, tx);
          if (contexto.modoAutorizacion !== 'PERMISOS') {
            throw new Error('La tienda no quedó en modo PERMISOS');
          }
          await this.auditoria.registrar(tx, contexto, {
            accion: ACCIONES_AUDITORIA.TIENDA_REGISTRAR,
            entidadTipo: 'Tenant',
            entidadId: tienda.id,
            correlacionId: randomUUID(),
          });
          return this.auth.emitirAcceso(contexto);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.manejarError(error);
    }
  }

  private async resolverPropietario(
    dto: RegistroPropietarioDto,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const cedula = dto.cedula.trim();
    const email = dto.email.trim().toLowerCase();
    const resultado = await this.identidad.verifyCredentials(
      cedula,
      dto.password,
      tx,
    );
    if (resultado.status === 'invalid-password') {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const cuenta = resultado.status === 'valid' ? resultado.account : null;
    if (cuenta?.email != null && cuenta.email.trim().toLowerCase() !== email) {
      throw new ConflictException('El correo no coincide con el de la cuenta');
    }
    if (
      await this.identidad.emailPerteneceAOtraCuenta(
        email,
        cuenta?.id ?? null,
        tx,
      )
    ) {
      throw new ConflictException('El correo pertenece a otra cuenta');
    }
    if (cuenta) return cuenta.id;

    const longitud = Buffer.byteLength(dto.password, 'utf8');
    if (longitud < 6 || longitud > 72) {
      throw new BadRequestException(
        'La contraseña nueva debe tener entre 6 y 72 bytes',
      );
    }
    const creada = await this.identidad.createAccount(
      {
        cedula,
        email,
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        password: dto.password,
      },
      tx,
    );
    return creada.id;
  }

  private async contexto(
    usuarioId: number,
    tenantId: number,
    tx: Prisma.TransactionClient,
  ) {
    const contexto = await this.auth.buscarContexto(usuarioId, tenantId, tx);
    if (contexto?.rolEfectivo.codigo !== 'OWNER') {
      throw new Error('No se pudo resolver el contexto del propietario');
    }
    return contexto;
  }

  private manejarError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034') {
        throw new ConflictException(
          'Otro registro coincidió con la operación. Reintenta.',
        );
      }
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        const campos = Array.isArray(target) ? target : [target];
        if (campos.includes('slug')) {
          throw new ConflictException('El slug de la tienda ya está en uso');
        }
        if (campos.includes('email')) {
          throw new ConflictException('El correo pertenece a otra cuenta');
        }
        if (campos.includes('cedula')) {
          throw new ConflictException(
            'La cuenta se registró durante esta operación. Reintenta.',
          );
        }
        throw new ConflictException('Ya existe un registro con esos datos');
      }
    }
    throw new InternalServerErrorException(
      'No se pudo completar el registro de la tienda',
    );
  }
}
