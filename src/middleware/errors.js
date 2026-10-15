import { STATUS_CODES } from 'node:http';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not Found' });
}

export function handleError(error, _req, res, next) {
  if (res.headersSent) return next(error);

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  if (status === 500) console.error(error);
  res.status(status).json({ error: STATUS_CODES[status] });
}
