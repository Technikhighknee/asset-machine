import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Router } from 'express';
import { config } from './config.js';
import { discover } from './discovery.js';

export async function createApiRouter() {
  const router = Router();

  for (const file of await discover(config.routesDir)) {
    const parts = relative(config.routesDir, file).slice(0, -3).split(sep);
    if (parts.at(-1) === 'index') parts.pop();
    const path = '/' + parts.join('/');

    const handler = (await import(pathToFileURL(file).href)).default;
    if (typeof handler !== 'function') {
      throw new TypeError('Route must export an Express router: ' + file);
    }
    router.use(path, handler);
  }

  return router;
}
