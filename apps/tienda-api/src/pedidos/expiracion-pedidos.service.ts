import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PedidosService } from './pedidos.service';

@Injectable()
export class ExpiracionPedidosService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExpiracionPedidosService.name);
  private timer?: NodeJS.Timeout;
  private trabajo?: Promise<void>;

  constructor(private readonly pedidos: PedidosService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.trabajo ??= this.pedidos
        .expirarPendientes()
        .catch((error: unknown) =>
          this.logger.error('Falló la expiración de pedidos', error),
        )
        .finally(() => {
          this.trabajo = undefined;
        });
    }, 5_000).unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.trabajo;
  }
}
