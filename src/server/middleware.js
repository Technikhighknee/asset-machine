import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { config } from '../runtime/config.js';
import { discover } from '../runtime/discovery.js';

export async function mountMiddleware(app, stage) {
  const directory = join(config.middlewareDir, stage);

  for (const file of await discover(directory)) {
    const middleware = (await import(pathToFileURL(file).href)).default;

    if (typeof middleware !== 'function') {
      throw new TypeError('Middleware must export a default function: ' + file);
    }

    app.use(middleware);
  }
}
