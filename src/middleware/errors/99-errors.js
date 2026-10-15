import { STATUS_CODES } from 'node:http';
import { logger } from '../../logger.js';

export default function handleError(error, _req, res, next) {
  if (res.headersSent) return next(error);

  const rawStatus = error.status ?? error.statusCode;
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500
    ? rawStatus
    : 500;

  if (status === 500) logger.error('Request failed', { error: error.stack ?? String(error) });
  res.status(status).json({ error: STATUS_CODES[status] ?? 'Request Failed' });
}
