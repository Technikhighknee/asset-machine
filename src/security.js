import { config } from './config.js';

export function isTrusted(req) {
  const host = config.host + ':' + req.socket.localPort;
  return req.headers.host === host &&
    (!req.headers.origin || req.headers.origin === 'http://' + host);
}

export function security(req, res, next) {
  if (!isTrusted(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}
