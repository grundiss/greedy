import { config } from './config.js';
import { createPostgresDb } from './db/postgres.js';
import { startServer } from './server.js';

// Standalone server entry (dev/Docker/server). The desktop build embeds the
// app differently — it calls startServer() itself with a PGlite db.
const db = createPostgresDb(config.databaseUrl);

try {
  await startServer({
    db,
    host: config.host,
    port: config.port,
    enableCors: true,
    logger:
      config.nodeEnv === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : true,
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
