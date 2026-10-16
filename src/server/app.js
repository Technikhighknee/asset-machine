import express from 'express';
import { config } from '../runtime/config.js';
import { createApiRouter } from './routes.js';
import { mountMiddleware } from './middleware.js';
import { security } from './security.js';
import { logRequest } from '../runtime/logger.js';
import { notFound, handleError } from './errors.js';

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(security);
  app.use(logRequest);
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonLimit }));

  await mountMiddleware(app, 'before');
  app.use('/api', await createApiRouter());
  app.use('/api', notFound);
  app.use('/vendor/three', express.static(config.threeDir, { dotfiles: 'deny' }));
  app.use(express.static(config.publicDir, { dotfiles: 'deny' }));
  await mountMiddleware(app, 'after');
  app.use(notFound);
  app.use(handleError);

  return app;
}
