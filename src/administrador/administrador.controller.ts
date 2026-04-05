import { Controller, Get, GoneException, Header } from '@nestjs/common';
import { UsuariosService } from '../usuarios/usuarios.service';

@Controller('administradores')
export class AdministradorController {
  constructor(private readonly usuariosService: UsuariosService) {
    void this.usuariosService;
  }

  @Get()
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  listar() {
    throw new GoneException(
      'GET /administradores fue retirado; use /staff?role=ADMIN',
    );
  }

  @Get('count')
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  conteo() {
    throw new GoneException(
      'GET /administradores/count fue retirado; use /staff',
    );
  }
}
