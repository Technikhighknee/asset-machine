import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { discover } from './discovery.js';

export async function mountMiddleware(app, stage) {
  for (const file of await discover(join(config.middlewareDir, stage))) {
    const middleware = (await import(pathToFileURL(file).href)).default;
    if (typeof middleware !== 'function') {
      throw new TypeError('Middleware must export a default function: ' + file);
    }
    app.use(middleware);
  }
}
