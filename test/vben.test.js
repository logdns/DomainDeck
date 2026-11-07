import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { openDatabase } from '../src/database.js';
import { createAccount } from '../src/accounts.js';
import { createApp } from '../src/server.js';
import { demoTransport, seedDemo } from '../src/demo.js';
import { decrypt } from '../src/vault.js';

async function fixture(callback) {
  const database = openDatabase(':memory:');
  const key = randomBytes(32);
  await createAccount(database, { username: 'admin', password: 'fixture-password' });
  await createAccount(database, { username: 'viewer', password: 'fixture-password', role: 'viewer' });
  database.prepare("UPDATE users SET role='viewer' WHERE username='viewer'").run();
  seedDemo(database, key);
  const server = createApp(database, { key, transport: demoTransport, version: '3.0.0-beta.6' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, token, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${base}/api/vben${path}`, { method, headers: { Origin: base, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...(await response.json()) };
  };
  const login = async (username) => { const result = await call('/auth/login', null, { username, password: 'fixture-password' }); assert.equal(result.status, 200); return result.data.accessToken; };
  try { await callback({ database, key, call, login }); }
  finally { await new Promise((resolve) => server.close(resolve)); database.close(); }
}

test('Vben authentication and every restored page receive the expected API structures over HTTP', () => fixture(async ({ call, login }) => {
  const token = await login('admin');
  const info = (await call('/user/info', token)).data;
  assert.deepEqual(info.roles, ['super']);
  assert.equal(info.homePath, '/overview');
  assert.ok((await call('/auth/codes', token)).data.includes('settings:write'));
  for (const path of ['/providers', '/providers/presets', '/connections', '/domains', '/accounts', '/roles', '/audit', '/orders', '/payments', '/notifications/log']) {
    const result = await call(path, token);
    assert.equal(result.status, 200, `${path}: ${result.message}`);
    assert.ok(Array.isArray(result.data.items), path);
  }
  const overview = (await call('/overview', token)).data;
  assert.equal(overview.domains.total, 3);
  assert.equal(overview.domains.items[0].connectionName.startsWith('Demo'), true);
  assert.equal(overview.stats.registrars, 3);
  assert.ok(Array.isArray(overview.audit));
  const providers = (await call('/providers', token)).data.items;
  assert.ok(providers.find((provider) => provider.id === 'spaceship').docs.includes('docs.spaceship.dev'));
  assert.ok(providers.find((provider) => provider.id === 'porkbun').fields.every((field) => field.key));
  const detail = await call('/domains/spaceship.example', token);
  assert.equal(detail.status, 200, detail.message);
  assert.equal(detail.data.info.name, 'spaceship.example');
  assert.equal(detail.data.info.can.renew, true);
  const cfDetail = await call('/domains/cloudflare.example', token);
  assert.equal(cfDetail.status, 200);
  assert.equal(cfDetail.data.zone.name, 'cloudflare.example');
  assert.equal(cfDetail.data.info.can.autorenew, false);
  const quotes = await call('/availability?domain=new.example', token);
  assert.equal(quotes.data.quotes.find((quote) => quote.provider === 'spaceship').availability.result, 'available');
  assert.equal(quotes.data.quotes.find((quote) => quote.provider === 'spaceship').prices.register.amount, '12.00');
  const zones = (await call('/dns/zones', token)).data;
  assert.equal(zones.total, 3);
  const zone = zones.items.find((item) => item.provider === 'spaceship');
  const records = await call(`/dns/zones/${encodeURIComponent(zone.id)}/records`, token);
  assert.equal(records.status, 200, records.message);
  assert.equal(records.data.items[0].content, 'demo-only');
  const notifications = (await call('/notifications', token)).data;
  assert.ok(notifications.rules.expiryDays.includes(30));
  assert.ok(notifications.channelTypes.find((type) => type.type === 'email').fields.some((field) => field.key === 'pass' && field.secret));
  assert.ok((await call('/permissions', token)).data.groups.every((group) => Array.isArray(group.items)));
  const runtime = (await call('/system/status', token)).data;
  assert.equal(runtime.app.version, '3.0.0-beta.6');
  assert.equal(runtime.counts.connections, 3);
  assert.equal((await call('/auth/logout', token, {})).status, 200);
  assert.equal((await call('/user/info', token)).status, 401);
}));

test('Vben account and role forms persist changes, partial edits retain fields, blank API secrets remain encrypted', () => fixture(async ({ database, key, call, login }) => {
  const token = await login('admin');
  const role = await call('/roles', token, { name: 'DNS only', code: 'dns-only', permissions: ['dns:read'] });
  assert.equal(role.status, 200);
  const created = await call('/accounts', token, { username: 'operator', password: 'fixture-password', roleCodes: [role.data.id], status: 'active', realName: 'Operator' });
  assert.equal(created.status, 200, created.message);
  const account = (await call('/accounts?keyword=operator', token)).data.items[0];
  assert.ok(account.roleCodes.includes(role.data.id));
  assert.equal(account.roleCodes.includes('viewer'), false);
  assert.equal((await call(`/accounts/${account.id}`, token, { status: 'disabled' }, 'PUT')).status, 200);
  assert.equal((await call('/accounts?keyword=operator', token)).data.items[0].realName, 'Operator');
  const connection = database.prepare("SELECT * FROM connections WHERE provider='spaceship'").get();
  assert.equal((await call(`/connections/${connection.id}`, token, { name: 'Renamed', credentials: { apiKey: '', apiSecret: '' } }, 'PUT')).status, 200);
  assert.deepEqual(decrypt(key, database.prepare('SELECT credentials FROM connections WHERE id=?').get(connection.id).credentials), { apiKey: 'demo', apiSecret: 'demo' });
  assert.deepEqual((await call('/connections', token)).data.items.find((item) => item.id === connection.id).credentials, {});
  assert.equal((await call(`/connections/${connection.id}/sync`, token, {})).status, 200);
  assert.equal((await call('/domains', token)).data.items.find((item) => item.provider === 'spaceship').name, 'spaceship.example');
  assert.ok(database.prepare('SELECT last_sync_at FROM connections WHERE id=?').get(connection.id).last_sync_at);
  const payment = await call('/payments', token, { type: 'paypal', name: 'Disabled fixture', account: 'fixture@example.test', status: 'disabled' });
  assert.equal(payment.status, 200);
  const listed = (await call('/payments', token)).data.items.find((item) => item.id === payment.data.id);
  assert.equal(listed.status, 'disabled');
  assert.equal(listed.account, 'fixture@example.test');
  assert.equal((await call(`/connections/${connection.id}`, token, { roles: ['registrar'] }, 'PUT')).status, 200);
  assert.equal((await call('/dns/zones', token)).data.items.some((item) => item.connectionId === connection.id), false);
  assert.equal((await call(`/dns/zones/${encodeURIComponent(`${connection.id}:spaceship.example`)}/records`, token)).status, 409);
}));

test('Vben viewer cannot see or mutate finance, account, registrar credentials or settings', () => fixture(async ({ call, login }) => {
  const token = await login('viewer');
  assert.equal((await call('/domains', token)).status, 200);
  const overview = (await call('/overview', token)).data;
  assert.equal('orders' in overview, false);
  assert.equal('audit' in overview, false);
  for (const path of ['/accounts', '/roles', '/connections', '/providers', '/payments', '/settings', '/notifications', '/audit']) assert.equal((await call(path, token)).status, 403, path);
  assert.equal((await call('/register', token, { domain: 'example.com', confirm: true })).status, 403);
  assert.equal((await call('/settings', token, { safety: { billingEnabled: true } }, 'PUT')).status, 403);
}));
