import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAccount } from '../src/accounts.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/server.js';
import { createSession, getSessionUser } from '../src/sessions.js';
import { createServer, request as httpRequest } from 'node:http';
import { publicOrigin } from '../src/origin.js';

test('public origin configuration rejects ambiguous URLs before starting the app', () => {
  assert.equal(publicOrigin('https://Deck.Example.test:443/'), 'https://deck.example.test');
  assert.equal(publicOrigin('http://localhost:8080'), 'http://localhost:8080');
  for (const value of ['null', '*', 'https:example.test', 'file:///tmp', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/path/..', 'https://example.test?query', 'https://example.test#hash', 'https://example.test\n', 'https://example.test\\evil', 'https://example.test/%25', "https://foo'bar.test"]) {
    assert.throws(() => createApp(null, { publicOrigin: value }), /Invalid public origin/, value);
  }
});

test('reverse proxy login uses an explicit origin and rejects spoofed forwarded headers and other origins', async () => {
  const database = openDatabase(':memory:');
  await createAccount(database, { username: 'admin', password: 'example-password' });
  const backend = createApp(database, { publicOrigin: 'https://deck.example.test' });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const proxy = createServer((request, response) => {
    const upstream = httpRequest({ hostname: '127.0.0.1', port: backend.address().port, method: request.method, path: request.url, headers: { ...request.headers, host: `127.0.0.1:${backend.address().port}` } }, (incoming) => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on('error', () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const base = `http://127.0.0.1:${proxy.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { Origin: 'https://deck.example.test' }, body: JSON.stringify({ username: 'admin', password: 'example-password' }) });
    assert.equal(login.status, 200);
    const token = (await login.json()).data.accessToken;
    const headers = { Origin: 'https://deck.example.test', Authorization: `Bearer ${token}` };
    assert.equal((await (await fetch(`${base}/api/v1/user/info`, { headers })).json()).data.username, 'admin');
    for (const origin of ['https://evil.example.test', 'http://deck.example.test', 'https://deck.example.test:8443', 'https://deck.example.test.evil.test', 'null', 'https://deck.example.test/', 'https://user@deck.example.test', `${base}`]) {
      const rejected = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { Origin: origin, 'X-Forwarded-Host': 'deck.example.test', 'X-Forwarded-Proto': 'https', Forwarded: 'host=deck.example.test;proto=https' }, body: '{}' });
      assert.equal(rejected.status, 403, origin);
    }
    assert.equal((await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/user/info`, { headers })).status, 401);
  } finally {
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => backend.close(resolve));
    database.close();
  }
});

test('without configured public origin the proxy must preserve Host', async () => {
  const database = openDatabase(':memory:');
  const server = createApp(database);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/v1/user/info`, { headers: { Origin: base } })).status, 401);
    assert.equal((await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { Origin: 'https://deck.example.test', 'X-Forwarded-Host': 'deck.example.test' }, body: '{}' })).status, 403);
  } finally { await new Promise((resolve) => server.close(resolve)); database.close(); }
});

test('login, authenticated user info and logout', async () => {
  const database = openDatabase(':memory:');
  await createAccount(database, { username: 'admin', password: 'example-password' });
  const server = createApp(database);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'example-password' }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json()).data.accessToken;
    const headers = { authorization: `Bearer ${token}` };
    const info = await fetch(`${base}/api/v1/user/info`, { headers });
    assert.equal((await info.json()).data.username, 'admin');
    assert.equal((await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/user/info`, { headers })).status, 401);
    assert.equal((await fetch(`${base}/api/v1/auth/login`, { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/missing`)).status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
});

test('expired sessions and disabled accounts are rejected', async () => {
  const database = openDatabase(':memory:');
  try {
    const account = await createAccount(database, { username: 'admin', password: 'example-password' });
    const session = createSession(database, account.id, 1000);
    assert.equal(getSessionUser(database, session.accessToken, 1000).id, account.id);
    assert.equal(getSessionUser(database, session.accessToken, 1000 + 12 * 60 * 60 * 1000), null);
    database.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', account.id);
    assert.equal(getSessionUser(database, session.accessToken, 1000), null);
  } finally {
    database.close();
  }
});
