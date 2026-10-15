import { config } from './config.js';

const levels = ['debug', 'info', 'warn', 'error'];

function write(level, message, details = {}) {
  if (levels.indexOf(level) < levels.indexOf(config.logLevel)) return;

  const output = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...details,
  });

  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

export const logger = Object.freeze({
  debug: (message, details) => write('debug', message, details),
  info: (message, details) => write('info', message, details),
  warn: (message, details) => write('warn', message, details),
  error: (message, details) => write('error', message, details),
});

export function logRequest(req, res, next) {
  const start = performance.now();

  res.once('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - start),
    });
  });

  next();
}
