import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelectContextDto } from './dto/select-context.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.cedula, dto.password, dto.accessMode);
  }

  @Post('select-context')
  selectContext(@Body() dto: SelectContextDto) {
    return this.authService.selectContext(dto);
  }

  @Post('register-owner')
  registerOwner(@Body() dto: RegisterDto) {
    return this.authService.registerOwner(dto);
  }
}
