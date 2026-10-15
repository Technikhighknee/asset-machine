import { createServer } from 'node:http';

import { createApp } from './server/app.js';
import { config } from './runtime/config.js';
import { logger } from './runtime/logger.js';
import { attachRealtime } from './server/realtime.js';

async function main() {
  const server = createServer(await createApp());
  const realtime = await attachRealtime(server);
  let stopping = false;

  async function stop() {
    if (stopping) return;
    stopping = true;

    try {
      await realtime.close();

      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Shutdown failed', { error: String(error) });
      process.exitCode = 1;
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void stop();
    });
  }

  server.on('error', (error) => {
    logger.error('Server error', { error: String(error) });
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    logger.info('Server listening', {
      host: config.host,
      port: config.port,
    });
  });
}

main().catch((error) => {
  logger.error('Startup failed', { error: String(error) });
  process.exitCode = 1;
});
