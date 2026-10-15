import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Router } from 'express';
import { config } from './config.js';
import { discover } from './discovery.js';

function routePath(file) {
  const parts = relative(config.routesDir, file).slice(0, -3).split(sep);
  if (parts.at(-1) === 'index') parts.pop();
  return '/' + parts.map((part) => {
    const param = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(part);
    if (param) return ':' + param[1];
    if (!/^[A-Za-z0-9_-]+$/.test(part)) {
      throw new Error('Invalid route filename: ' + file);
    }
    return part;
  }).join('/');
}

export async function createApiRouter() {
  const router = Router();
  const files = await discover(config.routesDir);
  const routes = files.map((file) => ({ file, path: routePath(file) }));
  routes.sort((a, b) => {
    const dynamicA = a.path.split('/').filter((p) => p.startsWith(':')).length;
    const dynamicB = b.path.split('/').filter((p) => p.startsWith(':')).length;
    return dynamicA - dynamicB || b.path.length - a.path.length || a.file.localeCompare(b.file);
  });

  for (const route of routes) {
    const handler = (await import(pathToFileURL(route.file).href)).default;
    if (typeof handler !== 'function') {
      throw new TypeError('Route must export an Express router: ' + route.file);
    }
    router.use(route.path, handler);
  }
  return router;
}
