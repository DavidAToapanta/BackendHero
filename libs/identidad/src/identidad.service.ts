import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const tokenAccountSelect = {
  id: true,
  cedula: true,
  email: true,
  userName: true,
} satisfies Prisma.UsuarioSelect;

const createdAccountSelect = {
  ...tokenAccountSelect,
  nombres: true,
  apellidos: true,
  fechaNacimiento: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect;

export type TokenAccount = Prisma.UsuarioGetPayload<{
  select: typeof tokenAccountSelect;
}>;

type AccountIdentifiers = {
  cedula?: string | null;
  email?: string | null;
  userName?: string | null;
};

export type AccountConflicts = {
  usuarioPorCedula: { id: number } | null;
  usuarioPorEmail: { id: number } | null;
  usuarioPorUserName: { id: number } | null;
};

type CreateAccountInput = {
  cedula: string;
  email?: string | null;
  userName?: string | null;
  nombres: string;
  apellidos: string;
  fechaNacimiento?: string | null;
  password: string;
};

type CredentialResult =
  | { status: 'valid'; account: TokenAccount }
  | { status: 'account-not-found' }
  | { status: 'invalid-password' };

@Injectable()
export class IdentidadService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number): Promise<TokenAccount | null> {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: tokenAccountSelect,
    });
  }

  async verifyCredentials(
    cedula: string,
    password: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CredentialResult> {
    const usuario = await tx.usuario.findUnique({
      where: { cedula },
      select: { ...tokenAccountSelect, password: true },
    });
    if (!usuario) {
      return { status: 'account-not-found' };
    }

    const { password: hash, ...account } = usuario;
    if (!(await bcrypt.compare(password, hash))) {
      return { status: 'invalid-password' };
    }

    return { status: 'valid', account };
  }

  async emailPerteneceAOtraCuenta(
    email: string,
    usuarioId: number | null,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const [coincidencia] = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Usuario"
      WHERE LOWER(TRIM(email)) = ${email} AND id IS DISTINCT FROM ${usuarioId}::integer
      LIMIT 1
    `;
    return coincidencia !== undefined;
  }

  async findConflicts(
    { cedula, email, userName }: AccountIdentifiers,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<AccountConflicts> {
    const select = { id: true } as const;
    const [usuarioPorCedula, usuarioPorEmail, usuarioPorUserName] =
      await Promise.all([
        cedula == null
          ? null
          : tx.usuario.findUnique({ where: { cedula }, select }),
        email == null
          ? null
          : tx.usuario.findUnique({ where: { email }, select }),
        userName == null
          ? null
          : tx.usuario.findUnique({ where: { userName }, select }),
      ]);

    return { usuarioPorCedula, usuarioPorEmail, usuarioPorUserName };
  }

  async createAccount(
    { password, ...data }: CreateAccountInput,
    tx: Prisma.TransactionClient,
  ) {
    const hash = await bcrypt.hash(password, 10);
    return tx.usuario.create({
      data: { ...data, password: hash },
      select: createdAccountSelect,
    });
  }
}
