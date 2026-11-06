import { Controller, Get, GoneException, Header } from '@nestjs/common';
import { UsuariosService } from '../usuarios/usuarios.service';

@Controller('recepcionistas')
export class RecepcionistaController {
  constructor(private readonly usuariosService: UsuariosService) {
    void this.usuariosService;
  }

  @Get()
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  listar() {
    throw new GoneException(
      'GET /recepcionistas fue retirado; use /staff?role=RECEPCIONISTA',
    );
  }

  @Get('count')
  @Header('Deprecation', 'true')
  @Header('Link', '</staff>; rel="successor-version"')
  conteo() {
    throw new GoneException(
      'GET /recepcionistas/count fue retirado; use /staff',
    );
  }
}
