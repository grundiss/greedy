import cors from '@fastify/cors';
import type { HealthResponse } from '@greedy/shared';
import Fastify from 'fastify';
import { config } from './config.js';

const app = Fastify({
  logger: {
    transport:
      config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
  },
});

await app.register(cors, { origin: true });

app.get('/health', async (): Promise<HealthResponse> => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
