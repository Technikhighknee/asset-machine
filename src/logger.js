import { config } from './config.js';

const levels = ['debug', 'info', 'warn', 'error'];

function write(level, message, details = {}) {
  if (levels.indexOf(level) < levels.indexOf(config.logLevel)) return;
  const entry = { time: new Date().toISOString(), level, message, ...details };
  const output = JSON.stringify(entry);
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
