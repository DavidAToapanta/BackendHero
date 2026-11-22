import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { ContextoTienda } from './auth.types';
import { ContextoTiendaActual } from './contexto-tienda.decorator';
import { LoginDto } from './dto/login.dto';
import { RegistroPropietarioDto } from './dto/registro-propietario.dto';
import { SelectContextDto } from './dto/select-context.dto';
import { RegistroPropietarioService } from './registro-propietario.service';
import { TiendaJwtGuard } from './tienda-jwt.guard';
import { PermisosService } from '@app/permisos';

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registro: RegistroPropietarioService,
    private readonly permisos: PermisosService,
  ) {}

  @Post('register-owner')
  registerOwner(@Body() dto: RegistroPropietarioDto) {
    return this.registro.registrar(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('select-context')
  @HttpCode(HttpStatus.OK)
  selectContext(@Body() dto: SelectContextDto) {
    return this.authService.selectContext(dto);
  }

  @Get('session')
  @UseGuards(TiendaJwtGuard)
  async session(@ContextoTiendaActual() context: ContextoTienda) {
    return {
      context: { ...context, ...(await this.permisos.accesoTienda(context)) },
    };
  }
}
