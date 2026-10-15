import { config } from '../../config.js';

export default function security(req, res, next) {
  const authority = config.host + ':' + req.socket.localPort;
  const origin = 'http://' + authority;
  if (req.headers.host !== authority ||
      (req.headers.origin && req.headers.origin !== origin)) {
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
