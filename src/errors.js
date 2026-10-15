import { STATUS_CODES } from 'node:http';

import { logger } from './logger.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not Found' });
}

export function handleError(error, _req, res, next) {
  if (res.headersSent) return next(error);

  const code = error.status ?? error.statusCode;
  const status = Number.isInteger(code) && code >= 400 && code < 500
    ? code
    : 500;

  if (status === 500) {
    logger.error('Request failed', { error: String(error) });
  }

  res.status(status).json({ error: STATUS_CODES[status] });
}
