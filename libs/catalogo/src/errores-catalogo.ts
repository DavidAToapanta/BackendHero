import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function traducirErrorCatalogo(
  error: unknown,
  mensajes: { P2002?: string; P2003?: string; P2025?: string },
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025' && mensajes.P2025) {
      throw new NotFoundException(mensajes.P2025);
    }
    if (error.code === 'P2002' && mensajes.P2002) {
      throw new ConflictException(mensajes.P2002);
    }
    if (error.code === 'P2003' && mensajes.P2003) {
      throw new ConflictException(mensajes.P2003);
    }
  }
  throw error;
}
