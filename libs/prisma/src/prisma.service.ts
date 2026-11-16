import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private muestreo?: NodeJS.Timeout;

  async onModuleInit() {
    await this.$connect();
    if (process.env.PRISMA_POOL_LOG === '1') {
      this.muestreo = setInterval(() => {
        void this.$metrics
          .json()
          .then(({ counters, gauges, histograms }) => {
            console.log(
              JSON.stringify({
                evento: 'prisma_pool',
                fecha: new Date().toISOString(),
                counters,
                gauges,
                histograms,
              }),
            );
          })
          .catch(() =>
            console.warn(
              JSON.stringify({ evento: 'prisma_pool_no_disponible' }),
            ),
          );
      }, 5_000).unref();
    }
  }

  async onModuleDestroy() {
    clearInterval(this.muestreo);
    await this.$disconnect();
  }
}
