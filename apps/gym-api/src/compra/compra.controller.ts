import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@app/seguridad';
import { RolesGuard } from '../auth/guards/roles.guard';
import { getTenantIdOrThrow } from '@app/seguridad';
import { CreateCompraDto } from './dto/create-compra.dto';
import { CompraService } from './compra.service';

@Controller('compra')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompraController {
  constructor(private readonly compraService: CompraService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() createCompraDto: CreateCompraDto, @Request() req) {
    return this.compraService.create(
      createCompraDto,
      getTenantIdOrThrow(req.user),
    );
  }
}
