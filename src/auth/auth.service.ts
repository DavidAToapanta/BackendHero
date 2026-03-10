import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { AsistenciaService } from '../asistencia/asistencia.service';

import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private asistenciaService: AsistenciaService,
  ) {}

  async login(cedula: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { cedula }, // ✅ usamos campo único
    });

    if (!usuario) {
      throw new UnauthorizedException('Cédula no encontrada');
    }

    const valid = await bcrypt.compare(password, usuario.password);
    if (!valid) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    let rol = 'SIN_ROL';
    const admin = await this.prisma.administrador.findFirst({
      where: { usuarioId: usuario.id },
    });
    const recep = await this.prisma.recepcionista.findFirst({
      where: { usuarioId: usuario.id },
    });
    const entrenador = await this.prisma.entrenador.findFirst({
      where: { usuarioId: usuario.id },
    });
    const cliente = await this.prisma.cliente.findFirst({
      where: { usuarioId: usuario.id },
      select: { id: true, activo: true },
    });

    if (admin) rol = 'ADMIN';
    else if (recep) rol = 'RECEPCIONISTA';
    else if (entrenador) rol = 'ENTRENADOR';
    else if (cliente) rol = 'CLIENTE';

    if (rol === 'CLIENTE' && cliente && !cliente.activo) {
      throw new UnauthorizedException('Cliente inactivo');
    }

    // const payload = { sub: usuario.id, userName: usuario.userName, cedula: usuario.cedula, role: rol };
    
    if (rol === 'CLIENTE' && cliente) {
      await this.asistenciaService.registrarAsistencia(cliente.id);
    }

    return {
      access_token: this.jwtService.sign({
        sub: usuario.id,
        userName: usuario.userName,
        cedula: usuario.cedula,
        rol,
        clienteId: cliente?.id,
      }),
    };
  }
}
