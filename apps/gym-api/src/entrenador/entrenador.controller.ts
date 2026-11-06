import { Controller, Get, GoneException, Header } from '@nestjs/common';
import { UsuariosService } from '../usuarios/usuarios.service';

@Controller('entrenadores')
export class EntrenadorController {
  constructor(private readonly usuariosService: UsuariosService) {
    void this.usuariosService;
  }

  @Get()
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  listar() {
    throw new GoneException(
      'GET /entrenadores fue retirado; use /staff?role=ENTRENADOR',
    );
  }

  @Get('count')
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  conteo() {
    throw new GoneException('GET /entrenadores/count fue retirado; use /staff');
  }
}
