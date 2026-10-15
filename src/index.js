import { createServer } from 'node:http';
import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';

async function main() {
  const app = await createApp();
  const server = createServer(app);
  const realtime = await attachRealtime(server);
  let stopping = false;

  async function shutdown(error) {
    if (stopping) return;
    stopping = true;
    if (error) {
      process.exitCode = 1;
      logger.error('Server failure', { error: error.stack ?? String(error) });
    }

    const watchdog = setTimeout(() => {
      logger.error('Shutdown timed out');
      process.exit(1);
    }, 5000);
    watchdog.unref();

    try {
      await realtime.close();
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
    } catch (closeError) {
      process.exitCode = 1;
      logger.error('Shutdown failure', { error: String(closeError) });
    } finally {
      clearTimeout(watchdog);
    }
  }

  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('uncaughtException', (error) => { void shutdown(error); });
  process.once('unhandledRejection', (reason) => { void shutdown(reason); });
  server.on('error', (error) => { void shutdown(error); });

  server.listen(config.port, config.host, () => {
    logger.info('Server listening', { host: config.host, port: config.port });
  });
}

main().catch((error) => {
  logger.error('Startup failure', { error: error.stack ?? String(error) });
  process.exitCode = 1;
});
