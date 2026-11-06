import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule, PrismaService } from './index';

@Injectable()
class PrismaConsumer {
  constructor(readonly prisma: PrismaService) {}
}

@Module({ providers: [PrismaConsumer] })
class ConsumerModule {}

describe('PrismaModule', () => {
  let module: TestingModule | undefined;

  afterEach(async () => {
    await module?.close();
    jest.restoreAllMocks();
  });

  it('comparte una instancia global y conserva la conexion y desconexion', async () => {
    module = await Test.createTestingModule({
      imports: [PrismaModule, ConsumerModule],
    }).compile();
    const prisma = module.get(PrismaService);
    const connect = jest.spyOn(prisma, '$connect').mockResolvedValue(undefined);
    const disconnect = jest
      .spyOn(prisma, '$disconnect')
      .mockResolvedValue(undefined);

    await module.init();

    expect(module.get(PrismaConsumer).prisma).toBe(prisma);
    expect(connect).toHaveBeenCalledTimes(1);

    await module.close();
    module = undefined;

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
