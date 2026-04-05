import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ProductoService } from './producto.service';

@Controller('producto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductoController {
  constructor(private readonly productoService: ProductoService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreateProductoDto, @Request() req) {
    return this.productoService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search = '',
    @Request() req,
  ) {
    return this.productoService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      search,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req) {
    return this.productoService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(@Param('id') id: string, @Body() dto: UpdateProductoDto, @Request() req) {
    return this.productoService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  remove(@Param('id') id: string, @Request() req) {
    return this.productoService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
