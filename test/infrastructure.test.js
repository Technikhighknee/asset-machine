import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { discover } from '../src/discovery.js';
import { createApp } from '../src/app.js';
import { attachRealtime } from '../src/realtime.js';
import { publish } from '../src/events.js';
import { config } from '../src/config.js';

test('file discovery includes nested JS files without requiring registration', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'asset-machine-'));
  try {
    await mkdir(join(folder, 'nested'));
    await writeFile(join(folder, 'one.js'), '');
    await writeFile(join(folder, 'nested', 'two.js'), '');
    await writeFile(join(folder, 'ignore.txt'), '');
    const files = await discover(folder);
    assert.deepEqual(files.map((file) => file.slice(folder.length + 1)).sort(), [
      'nested' + (process.platform === 'win32' ? '\\' : '/') + 'two.js',
      'one.js',
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('HTTP, static files, errors, and WebSocket share one local server', async () => {
  const app = await createApp();
  const server = createServer(app);
  const realtime = await attachRealtime(server);
  await new Promise((resolve) => server.listen(0, config.host, resolve));
  const port = server.address().port;
  const url = 'http://' + config.host + ':' + port;
  const wsUrl = 'ws://' + config.host + ':' + port + '/ws';
  const assetFile = join(config.publicDir, 'asset-machine-infrastructure-test-' + process.pid + '.txt');
  try {
    assert.deepEqual(await (await fetch(url + '/api/health')).json(), { status: 'ok' });
    assert.equal((await fetch(url + '/api/missing')).status, 404);

    const invalid = await fetch(url + '/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(invalid.status, 400);

    await mkdir(config.publicDir, { recursive: true });
    await writeFile(assetFile, 'served statically');
    const asset = await fetch(url + '/' + assetFile.split(/[\\/]/).at(-1));
    assert.equal(await asset.text(), 'served statically');

    assert.equal((await fetch(url + '/api/health', {
      headers: { Host: 'evil.example' },
    })).status, 403);
    assert.equal((await fetch(url + '/api/health', {
      headers: { Origin: 'https://evil.example' },
    })).status, 403);

    const badWsStatus = await new Promise((resolve, reject) => {
      const client = new WebSocket(wsUrl, { origin: 'https://evil.example' });
      client.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode);
      });
      client.once('error', reject);
    });
    assert.equal(badWsStatus, 403);

    const client = new WebSocket(wsUrl, { origin: url });
    await new Promise((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    const message = new Promise((resolve) => client.once('message', (data) => resolve(JSON.parse(data.toString()))));
    publish('notice', { value: 1 });
    assert.deepEqual(await message, { type: 'notice', payload: { value: 1 } });
    client.close();
  } finally {
    await rm(assetFile, { force: true });
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
