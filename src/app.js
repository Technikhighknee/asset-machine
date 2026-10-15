import express from 'express';
import { config } from './config.js';
import { mountMiddleware } from './middleware.js';
import { createApiRouter } from './routes.js';

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');

  await mountMiddleware(app, 'before');
  app.use('/api', await createApiRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not Found' }));
  app.use(express.static(config.publicDir, { dotfiles: 'deny' }));
  await mountMiddleware(app, 'after');
  await mountMiddleware(app, 'errors');

  return app;
}
