import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { subscribe } from './events.js';
import { discover } from './discovery.js';
import { logger } from './logger.js';

function send(client, type, payload) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ type, payload }));
  }
}

export async function attachRealtime(server) {
  const handlers = new Map();
  for (const file of await discover(config.messagesDir)) {
    const type = relative(config.messagesDir, file).slice(0, -3).split(sep).join('.');
    const handler = (await import(pathToFileURL(file).href)).default;
    if (typeof handler !== 'function') {
      throw new TypeError('Message handler must export a default function: ' + file);
    }
    handlers.set(type, handler);
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.wsMaxPayload });
  server.on('upgrade', (request, socket, head) => {
    const authority = config.host + ':' + socket.localPort;
    const validUrl = request.url === '/ws';
    const validHost = request.headers.host === authority;
    const origin = request.headers.origin;
    const validOrigin = !origin || origin === 'http://' + authority;

    if (!validUrl || !validHost || !validOrigin) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request);
    });
  });

  const broadcast = (type, payload) => {
    for (const client of wss.clients) send(client, type, payload);
  };

  const unsubscribe = subscribe(broadcast);

  wss.on('connection', (client) => {
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    client.on('message', async (raw, isBinary) => {
      try {
        if (isBinary) throw new Error('Expected JSON message');
        const message = JSON.parse(raw.toString('utf8'));
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
          throw new Error('Expected a message with a type');
        }
        const handler = handlers.get(message.type);
        if (!handler) throw new Error('Unknown message type');
        await handler({
          client,
          payload: message.payload,
          send: (type, payload) => send(client, type, payload),
          broadcast,
        });
      } catch (error) {
        logger.warn('WebSocket message rejected', { error: String(error) });
        send(client, 'error', { message: 'Invalid or failed message' });
      }
    });
    client.on('error', (error) => logger.warn('WebSocket client error', { error: String(error) }));
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    broadcast,
    async close() {
      clearInterval(heartbeat);
      unsubscribe();
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
