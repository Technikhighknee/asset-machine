import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

import { config } from '../runtime/config.js';
import { discover } from '../runtime/discovery.js';
import { subscribe } from '../runtime/events.js';
import { logger } from '../runtime/logger.js';
import { isTrusted } from './security.js';

function send(client, type, payload) {
  if (client.readyState !== WebSocket.OPEN) return;

  client.send(JSON.stringify({ type, payload }));
}

async function loadHandlers() {
  const handlers = new Map();

  for (const file of await discover(config.messagesDir)) {
    const type = relative(config.messagesDir, file)
      .slice(0, -3)
      .split(sep)
      .join('.');

    const handler = (await import(pathToFileURL(file).href)).default;

    if (typeof handler !== 'function') {
      throw new TypeError('Invalid message handler: ' + file);
    }

    handlers.set(type, handler);
  }

  return handlers;
}

export async function attachRealtime(server) {
  const handlers = await loadHandlers();

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: config.wsMaxPayload,
    verifyClient: ({ req }, done) => done(isTrusted(req), 403),
  });

  function broadcast(type, payload) {
    for (const client of wss.clients) {
      send(client, type, payload);
    }
  }

  const unsubscribe = subscribe(broadcast);

  wss.on('connection', (client) => {
    client.isAlive = true;

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('error', (error) => {
      logger.warn('WebSocket error', { error: String(error) });
    });

    client.on('message', async (data, isBinary) => {
      try {
        if (isBinary) {
          throw new Error('Expected JSON');
        }

        const { type, payload } = JSON.parse(data.toString());
        const handler = handlers.get(type);

        if (!handler) {
          throw new Error('Unknown message type: ' + type);
        }

        await handler({
          client,
          payload,
          send: (type, payload) => send(client, type, payload),
          broadcast,
        });
      } catch (error) {
        logger.warn('WebSocket message failed', { error: String(error) });
        send(client, 'error', { message: 'Invalid or failed message' });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN || !client.isAlive) {
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

      for (const client of wss.clients) {
        client.terminate();
      }

      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
