import {
  Controller,
  Delete,
  GoneException,
  Get,
  Header,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  crear() {
    throw new GoneException(
      'POST /usuarios fue retirado; use /staff para la gestion de personal',
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  listar() {
    throw new GoneException(
      'GET /usuarios fue retirado; use /staff para la gestion de personal',
    );
  }

  @Get(':id')
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  obtenerPorId() {
    throw new GoneException(
      'GET /usuarios/:id fue retirado; use /staff/:usuarioId',
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  eliminar() {
    throw new GoneException(
      'DELETE /usuarios/:id fue retirado; use el flujo tenant-aware de /staff',
    );
  }

  @Get('counts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  conteos() {
    throw new GoneException(
      'GET /usuarios/counts fue retirado; use /staff para la gestion de personal',
    );
  }
}
