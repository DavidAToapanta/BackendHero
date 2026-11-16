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
import { SelectContextDto } from './dto/select-context.dto';
import { TiendaJwtGuard } from './tienda-jwt.guard';

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  session(@ContextoTiendaActual() context: ContextoTienda) {
    return { context };
  }
}
