import { PrismaService } from '@app/prisma';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { IdentidadService } from './identidad.service';

describe('IdentidadService', () => {
  const account = {
    id: 10,
    cedula: '0102030405',
    email: 'ana@example.test',
    userName: 'ana',
  };
  const findUnique = jest.fn();
  const service = new IdentidadService({
    usuario: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('consulta los datos para emitir tokens por ID', async () => {
    findUnique.mockResolvedValue(account);
    await expect(service.findById(account.id)).resolves.toEqual(account);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: account.id },
      select: { id: true, cedula: true, email: true, userName: true },
    });
  });

  it('valida un hash existente sin exponerlo', async () => {
    const password = 'clave-de-prueba';
    findUnique.mockResolvedValue({
      ...account,
      password: await bcrypt.hash(password, 10),
    });

    await expect(
      service.verifyCredentials(account.cedula, password),
    ).resolves.toEqual({ status: 'valid', account });
    await expect(
      service.verifyCredentials(account.cedula, 'otra-clave'),
    ).resolves.toEqual({ status: 'invalid-password' });
  });

  it('distingue una cuenta inexistente', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.verifyCredentials(account.cedula, 'password'),
    ).resolves.toEqual({ status: 'account-not-found' });
  });

  it('devuelve coincidencias independientes y omite campos no suministrados', async () => {
    findUnique
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ id: 22 })
      .mockResolvedValueOnce({ id: 10 });
    await expect(service.findConflicts(account)).resolves.toEqual({
      usuarioPorCedula: { id: 10 },
      usuarioPorEmail: { id: 22 },
      usuarioPorUserName: { id: 10 },
    });
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { cedula: account.cedula },
      select: { id: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: account.email },
      select: { id: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(3, {
      where: { userName: account.userName },
      select: { id: true },
    });
    await expect(service.findConflicts({ email: null })).resolves.toEqual({
      usuarioPorCedula: null,
      usuarioPorEmail: null,
      usuarioPorUserName: null,
    });
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('crea la cuenta con la transacción recibida y selecciona campos sin hash', async () => {
    const { id, ...identifiers } = account;
    const input = {
      ...identifiers,
      nombres: 'Ana',
      apellidos: 'Pérez',
      password: ' clave sin normalizar ',
    };
    const { password, ...data } = input;
    const saved = { id, ...data, fechaNacimiento: null };
    const create = jest.fn().mockResolvedValue(saved);
    const tx = { usuario: { create } } as unknown as Prisma.TransactionClient;

    await expect(service.createAccount(input, tx)).resolves.toEqual(saved);
    const [args] = create.mock.calls[0] as [Prisma.UsuarioCreateArgs];
    const { password: hash, ...persisted } = args.data;
    expect(persisted).toEqual(data);
    expect(bcrypt.getRounds(hash)).toBe(10);
    await expect(bcrypt.compare(password, hash)).resolves.toBe(true);
    expect(args.select).not.toHaveProperty('password');
    expect(args.select).toMatchObject({ createdAt: true, updatedAt: true });
  });
});
