import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAccount } from '../src/accounts.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/server.js';
import { createSession, getSessionUser } from '../src/sessions.js';

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
