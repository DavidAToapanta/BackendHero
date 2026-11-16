import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { ClienteParamDto, ListaClientesDto } from './dto/lista-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('clientes')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.customers.write')
  create(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() ficha: CreateClienteDto,
  ) {
    return this.clientesService.registrar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      ficha,
    );
  }

  @Get()
  @RequierePermisoTienda('store.customers.read')
  findAll(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaClientesDto,
  ) {
    return this.clientesService.listar(contexto.tenantId, {
      buscar: filtros.q,
      activo:
        filtros.activo === undefined ? undefined : filtros.activo === 'true',
      pagina: filtros.pagina,
      limite: filtros.limite,
    });
  }

  @Get(':id')
  @RequierePermisoTienda('store.customers.read')
  findOne(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: ClienteParamDto,
  ) {
    return this.clientesService.obtener(contexto.tenantId, id);
  }

  @Patch(':id')
  @RequierePermisoTienda('store.customers.write')
  update(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: ClienteParamDto,
    @Body() cambios: UpdateClienteDto,
  ) {
    if (Object.values(cambios).every((valor) => valor === undefined)) {
      throw new BadRequestException('Indique al menos un campo para editar');
    }
    return this.clientesService.editar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      id,
      cambios,
    );
  }

  @Delete(':id')
  @RequierePermisoTienda('store.customers.write')
  remove(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: ClienteParamDto,
  ) {
    return this.clientesService.desactivar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      id,
    );
  }
}
