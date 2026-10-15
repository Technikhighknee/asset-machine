import app from './app.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError('PORT must be an integer from 1 to 65535');
}

const server = app.listen(port, host);

server.on('listening', () => {
  console.log(`Asset Machine listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('HTTP server error:', error);
  process.exitCode = 1;
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error('HTTP server shutdown error:', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
