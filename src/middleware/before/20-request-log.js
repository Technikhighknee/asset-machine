import { logger } from '../../logger.js';

export default function requestLog(req, res, next) {
  const started = performance.now();
  res.once('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    });
  });
  next();
}
