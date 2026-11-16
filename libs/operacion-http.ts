import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { INestApplication } from '@nestjs/common';
import type { Express, RequestHandler } from 'express';
import { PrismaService } from '@app/prisma';

export function configurarOperacionHttp(
  app: INestApplication,
  servicio: string,
) {
  const http = app.getHttpAdapter().getInstance() as Express;
  const prisma = app.get(PrismaService);
  app.enableShutdownHooks();

  const instrumentar: RequestHandler = (req, res, next) => {
    const inicio = performance.now();
    const entrada = req.get('x-request-id');
    const correlacionId =
      entrada && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(entrada)
        ? entrada
        : randomUUID();
    res.setHeader('X-Request-Id', correlacionId);
    res.once('close', () => {
      const ruta = (req.route as { path?: unknown } | undefined)?.path;
      console.log(
        JSON.stringify({
          servicio,
          correlacionId,
          metodo: req.method,
          ruta: typeof ruta === 'string' ? ruta : 'sin-ruta',
          duracionMs: Math.round((performance.now() - inicio) * 100) / 100,
          estado: res.writableFinished ? res.statusCode : null,
          abortada: !res.writableFinished,
        }),
      );
    });
    next();
  };
  app.use(instrumentar);
  http.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  http.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1`;
        },
        { maxWait: 1_000, timeout: 1_000 },
      );
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
}
