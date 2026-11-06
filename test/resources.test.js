import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { openDatabase } from '../src/database.js';
import { createAccount } from '../src/accounts.js';
import { initialize } from '../src/initialize.js';
import { createApp } from '../src/server.js';
import { createSession } from '../src/sessions.js';
import { decrypt, encrypt, loadKey } from '../src/vault.js';

test('first boot uses a recoverable private random password and preserves existing accounts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-init-'));
  const database = openDatabase(':memory:');
  try {
    assert.equal(await initialize(database, directory), true);
    const password = readFileSync(join(directory, 'initial-admin-password'), 'utf8');
    assert.ok(password.trim().length >= 32);
    assert.equal(statSync(join(directory, 'initial-admin-password')).mode & 0o777, 0o600);
    assert.equal(await initialize(database, directory), false);
    assert.equal(readFileSync(join(directory, 'initial-admin-password'), 'utf8'), password);
    assert.equal(database.prepare('SELECT count(*) AS count FROM users').get().count, 1);
  } finally { database.close(); rmSync(directory, { recursive: true }); }
});

test('vault detects tampering and keeps plaintext out of stored values', () => {
  const key = randomBytes(32);
  const sealed = encrypt(key, { token: 'dummy-provider-secret' });
  assert.ok(!sealed.includes('dummy-provider-secret'));
  assert.deepEqual(decrypt(key, sealed), { token: 'dummy-provider-secret' });
  assert.throws(() => decrypt(randomBytes(32), sealed));
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-key-'));
  try {
    const path = join(directory, 'vault.key');
    assert.throws(() => loadKey(path, false));
    assert.equal(existsSync(path), false);
    assert.deepEqual(loadKey(path), loadKey(path, false));
  } finally { rmSync(directory, { recursive: true }); }
});

test('admin settings, provider sync, import, read-only permissions, and session revocation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-api-'));
  const database = openDatabase(':memory:');
  await initialize(database, directory);
  const admin = database.prepare('SELECT * FROM users').get();
  const viewer = await createAccount(database, { username: 'readonly', password: 'viewer-password' });
  database.prepare("UPDATE users SET role='viewer' WHERE id=?").run(viewer.id);
  const adminToken = createSession(database, admin.id).accessToken;
  const viewerToken = createSession(database, viewer.id).accessToken;
  const key = randomBytes(32);
  const requests = [];
  const server = createApp(database, { key, dataDirectory: directory, version: '3.0.0-beta.1', transport: async (url, options) => {
    requests.push({ url, options });
    return Response.json({ status: 'SUCCESS', domains: [{ domain: 'example.com', expireDate: '2030-01-01', autoRenew: '1' }] });
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body, token = adminToken, extra = {}) => {
    const response = await fetch(`${base}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await call('/accounts', 'GET', null, viewerToken)).status, 403);
    assert.equal((await call('/domains', 'POST', { name: 'denied.example' }, viewerToken)).status, 403);
    assert.equal((await call('/domains', 'POST', { name: 'denied.example' }, adminToken, { Origin: 'https://evil.example' })).status, 403);
    const connection = await call('/connections', 'POST', { name: 'My Porkbun', provider: 'porkbun', credentials: { apiKey: 'dummy-key', secretKey: 'dummy-secret' } });
    assert.equal(connection.status, 200);
    const listed = await call('/connections');
    assert.ok(!JSON.stringify(listed).includes('dummy-secret'));
    assert.ok(!database.prepare('SELECT credentials FROM connections').get().credentials.includes('dummy-secret'));
    const sync = await call(`/connections/${connection.data.id}/sync`, 'POST');
    assert.equal(sync.status, 200);
    assert.equal(requests[0].options.method, 'POST');
    const assets = await call('/domains');
    assert.equal(assets.data[0].name, 'example.com');
    assert.equal((await call('/domains/import', 'POST', { domains: [{ name: 'valid.example' }, { name: '../bad' }] })).status, 400);
    assert.equal((await call('/domains')).data.length, 1);
    assert.equal((await call('/domains/import', 'POST', { domains: [{ name: 'another.example' }] })).status, 200);
    assert.equal((await call(`/accounts/${admin.id}`, 'PATCH', { username: 'admin', role: 'viewer', status: 'active', currentPassword: readFileSync(join(directory, 'initial-admin-password'), 'utf8').trim() })).status, 400);
    const updated = await call(`/accounts/${admin.id}`, 'PATCH', { username: 'newadmin', role: 'admin', status: 'active', currentPassword: readFileSync(join(directory, 'initial-admin-password'), 'utf8').trim(), password: 'a-new-password-123' });
    assert.equal(updated.status, 200);
    assert.equal((await call('/user/info')).status, 401);
    assert.equal(existsSync(join(directory, 'initial-admin-password')), false);
    const info = await call('/user/info', 'GET', null, viewerToken);
    assert.equal(info.data.role, 'viewer');
  } finally { await new Promise((resolve) => server.close(resolve)); database.close(); rmSync(directory, { recursive: true }); }
});
