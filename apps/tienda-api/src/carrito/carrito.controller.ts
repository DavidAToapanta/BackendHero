import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IdPortalDto } from '../portal/portal.dto';
import { ClientePortalActual, PortalGuard } from '../portal/portal.guard';
import type { ClientePortal } from '../portal/portal.service';
import { GuardarCarritoDto } from './carrito.dto';
import { CarritoService } from './carrito.service';

@Controller('carrito')
@UseGuards(PortalGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CarritoController {
  constructor(private readonly carrito: CarritoService) {}

  @Post()
  crear(
    @ClientePortalActual() cliente: ClientePortal,
    @Body() datos: GuardarCarritoDto,
  ) {
    return this.carrito.guardar(cliente, datos);
  }

  @Get()
  activo(@ClientePortalActual() cliente: ClientePortal) {
    return this.carrito.consultar(cliente);
  }

  @Get(':id')
  obtener(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return this.carrito.consultar(cliente, id);
  }

  @Patch(':id')
  editar(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
    @Body() datos: GuardarCarritoDto,
  ) {
    return this.carrito.guardar(cliente, datos, id);
  }

  @Delete(':id')
  @HttpCode(204)
  abandonar(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return this.carrito.abandonar(cliente, id);
  }
}
