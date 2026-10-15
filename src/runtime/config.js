import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const levels = ['debug', 'info', 'warn', 'error'];
const logLevel = process.env.LOG_LEVEL ?? 'info';

if (!levels.includes(logLevel)) {
  throw new Error('LOG_LEVEL must be debug, info, warn or error');
}

export const config = Object.freeze({
  host: '127.0.0.1',
  port,
  logLevel,
  publicDir: join(root, 'public'),
  routesDir: join(root, 'src', 'routes'),
  middlewareDir: join(root, 'src', 'middleware'),
  messagesDir: join(root, 'src', 'messages'),
  jsonLimit: '1mb',
  wsMaxPayload: 1024 * 1024,
});
