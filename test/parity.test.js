import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAccount, hashPassword, authenticateAccount } from '../src/accounts.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/server.js';
import { createSession } from '../src/sessions.js';
import { decrypt, encrypt } from '../src/vault.js';
import { importLegacy } from '../src/migration.js';
import { parseXML, ManifestProvider, validateManifest } from '../src/manifests.js';
import { presets } from '../src/registry.js';
import { publicAddress, publicURL } from '../src/network.js';
import { createNotificationService, deliver } from '../src/notifications.js';
import { mailAddress } from '../src/smtp.js';
import { priceOf } from '../src/commerce.js';

const price = { amount: '12.34', currency: 'USD' };
const quotes = { prices: Object.fromEntries(['register', 'renew', 'transfer'].map((kind) => [kind, [{ period: { value: 1, unit: 'y' }, priceInDefaultCurrency: { finalPrice: price } }]])) };

async function fixture(callback, options = {}) {
  const database = openDatabase(':memory:');
  const admin = await createAccount(database, { username: 'admin', password: 'admin-test-password' });
  const viewer = await createAccount(database, { username: 'viewer', password: 'viewer-test-password' });
  database.prepare("UPDATE users SET role='viewer' WHERE id=?").run(viewer.id);
  const tokens = { admin: createSession(database, admin.id).accessToken, viewer: createSession(database, viewer.id).accessToken };
  const key = randomBytes(32);
  const requests = [];
  const transport = async (url, settings) => {
    const parsed = new URL(url);
    const payload = settings.body ? JSON.parse(settings.body) : {};
    requests.push({ url, settings, payload });
    if (parsed.pathname.endsWith('/pricing')) return Response.json(quotes);
    if (parsed.pathname.endsWith('/available')) return Response.json({ result: 'available' });
    if (parsed.pathname.includes('/async-operations/')) return Response.json({ status: 'success' });
    if (parsed.pathname.includes('/dns/records/')) return settings.method === 'GET' ? Response.json({ items: [{ type: 'TXT', name: '@', value: 'verification-value', ttl: 600, group: { type: 'custom' } }], total: 1 }) : new Response(null, { status: 204 });
    if (parsed.pathname.endsWith('/domains') && settings.method === 'GET') return Response.json({ items: [{ name: 'managed.example', expirationDate: '2030-01-01', autoRenew: true }], total: 1 });
    if (parsed.pathname.includes('/domains/') && ['POST'].includes(settings.method)) return new Response(null, { status: 202, headers: { 'spaceship-async-operationid': 'operation-one' } });
    if (parsed.pathname.includes('/domains/') && settings.method === 'GET') return Response.json({ expirationDate: '2030-01-01T00:00:00.000Z' });
    if (parsed.pathname.endsWith('/contacts')) return Response.json({ contactId: 'contact-id' });
    if (parsed.hostname === 'api.porkbun.com' && parsed.pathname.endsWith('/domain/listAll')) return Response.json({ status: 'SUCCESS', domains: [{ domain: 'porkbun.example' }] });
    if (parsed.pathname.endsWith('/registrar/domain-check')) return Response.json({ success: true, result: { domains: [{ name: payload.domains[0], registrable: true, pricing: { registration_cost: '9.99', renewal_cost: '10.99', currency: 'USD' } }] } });
    if (parsed.pathname.includes('/billing/profile')) return Response.json({ success: true, result: { card_number: '4111111111111111', card_expiry_year: 2030, card_expiry_month: 1 } });
    if (parsed.pathname.includes('/zones')) return Response.json({ success: true, result: [], result_info: { total_pages: 1 } });
    return Response.json({ ok: true });
  };
  const server = createApp(database, { key, transport, resolver: { resolve: async () => ['203.0.113.5'] }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const call = async (path, method = 'GET', body, actor = 'admin') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...(await response.json()) };
  };
  const add = async (provider = 'spaceship') => {
    const credentials = provider === 'cloudflare' ? { token: 'test-token', accountId: 'a'.repeat(32) } : provider === 'porkbun' ? { apiKey: 'test-key', secretKey: 'test-secret' } : { apiKey: 'test-key', apiSecret: 'test-secret' };
    const result = await call('/connections', 'POST', { name: provider, provider, credentials });
    assert.equal(result.status, 200, result.message);
    return result.data.id;
  };
  try { await callback({ database, key, call, add, requests, admin, viewer, tokens }); }
  finally { await new Promise((resolve) => server.close(resolve)); database.close(); }
}

test('connection edits retain encrypted secrets, default exclusivity, disable blocks outbound requests', async () => fixture(async ({ call, add, database, key, requests }) => {
  const first = await add();
  const second = await add('porkbun');
  assert.equal((await call(`/connections/${first}/default`, 'POST')).status, 200);
  assert.equal((await call(`/connections/${second}/default`, 'POST')).status, 200);
  assert.equal((await call('/connections')).data.filter((item) => item.isDefault).length, 1);
  assert.equal((await call(`/connections/${first}`, 'PUT', { name: 'renamed', credentials: {}, enabled: false })).status, 200);
  assert.equal(decrypt(key, database.prepare('SELECT credentials FROM connections WHERE id=?').get(first).credentials).apiSecret, 'test-secret');
  const count = requests.length;
  assert.equal((await call(`/connections/${first}/test`, 'POST')).status, 409);
  assert.equal(requests.length, count);
  assert.equal((await call(`/connections/${first}/default`, 'POST')).status, 409);
}));

test('custom roles grant only declared permissions and revoke existing sessions when edited', async () => fixture(async ({ call, viewer, database, tokens }) => {
  const role = await call('/roles', 'POST', { name: 'DNS editor', permissions: ['dns:write'] });
  assert.equal(role.status, 200);
  assert.equal((await call(`/accounts/${viewer.id}/roles`, 'PUT', { roleIds: [role.data.id] })).status, 200);
  assert.equal((await call('/user/info', 'GET', null, 'viewer')).status, 401);
  tokens.viewer = createSession(database, viewer.id).accessToken;
  assert.ok((await call('/user/info', 'GET', null, 'viewer')).data.permissions.includes('dns:write'));
  assert.equal((await call('/settings', 'PUT', { safety: { billingEnabled: true } }, 'viewer')).status, 403);
  assert.equal((await call('/register', 'POST', { confirm: true }, 'viewer')).status, 403);
  assert.equal((await call(`/roles/${role.data.id}`, 'PUT', { name: 'DNS reader', permissions: ['dns:read'] })).status, 200);
  assert.equal((await call('/user/info', 'GET', null, 'viewer')).status, 401);
  assert.equal((await call('/roles/admin', 'DELETE')).status, 400);
}));

test('purchases require billing enablement, confirmation and matching quote; retries do not charge twice', async () => fixture(async ({ call, add, requests }) => {
  const connectionId = await add();
  const purchase = { domain: 'new.example', connectionId, years: 1, confirm: true, requestId: 'purchase-request-0001', contacts: { registrant: 'contact-one' }, expectedPrice: price };
  assert.equal((await call('/register', 'POST', purchase)).status, 409);
  await call('/settings', 'PUT', { safety: { billingEnabled: true } });
  assert.equal((await call('/register', 'POST', { ...purchase, confirm: false })).status, 400);
  assert.equal((await call('/register', 'POST', { ...purchase, expectedPrice: { amount: '1', currency: 'USD' } })).status, 409);
  const result = await call('/register', 'POST', purchase);
  assert.equal(result.status, 200, result.message);
  assert.equal(result.data.order.status, 'pending');
  assert.equal(result.data.order.operationId, 'operation-one');
  const count = requests.filter((entry) => entry.settings.method === 'POST' && new URL(entry.url).pathname.endsWith('/domains/new.example')).length;
  assert.equal((await call('/register', 'POST', purchase)).data.replay, true);
  assert.equal(requests.filter((entry) => entry.settings.method === 'POST' && new URL(entry.url).pathname.endsWith('/domains/new.example')).length, count);
  assert.equal((await call('/register', 'POST', { ...purchase, domain: 'different.example' })).status, 409);
  assert.equal((await call('/orders/sync', 'POST')).status, 200);
  assert.equal((await call('/orders')).data[0].status, 'completed');
}));

test('unconfirmed purchase outcome is retained for manual reconciliation, never retried implicitly', async () => {
  let writes = 0;
  await fixture(async ({ call, add }) => {
    const connectionId = await add();
    await call('/settings', 'PUT', { safety: { billingEnabled: true } });
    const purchase = { domain: 'timeout.example', connectionId, confirm: true, requestId: 'timeout-request-0001', expectedPrice: price, contacts: { registrant: 'contact-one' } };
    assert.equal((await call('/register', 'POST', purchase)).status, 502);
    const order = (await call('/orders')).data[0];
    assert.equal(order.status, 'needs-review');
    assert.equal((await call('/register', 'POST', purchase)).data.replay, true);
    assert.equal((await call('/register', 'POST', { ...purchase, requestId: 'timeout-request-0002' })).status, 409);
    assert.equal(writes, 1);
    assert.equal((await call(`/orders/${order.id}`, 'PUT', { status: 'completed', note: 'Verified with provider invoice' })).status, 200);
  }, { transport: async (url, options) => {
    if (url.endsWith('/pricing')) return Response.json(quotes);
    if (options.method === 'POST') { writes += 1; throw new Error('Simulated timeout'); }
    return Response.json({ items: [], total: 0 });
  } });
});

test('Spaceship DNS add/delete uses exact resource fields and no response-only group metadata', async () => fixture(async ({ call, add, requests }) => {
  const connectionId = await add();
  await call(`/connections/${connectionId}/sync`, 'POST');
  const domain = (await call('/domains')).data[0];
  const records = await call(`/domains/${domain.id}/dns`);
  assert.equal(records.data[0].content, 'verification-value');
  assert.equal((await call(`/domains/${domain.id}/dns`, 'POST', { type: 'A', name: '@', content: '203.0.113.1', ttl: 600 })).status, 200);
  const write = requests.find((entry) => entry.settings.method === 'PUT' && entry.url.includes('/dns/records/'));
  assert.deepEqual(write.payload, { force: false, items: [{ type: 'A', name: '@', ttl: 600, address: '203.0.113.1' }] });
  assert.equal((await call(`/domains/${domain.id}/dns/${records.data[0].id}`, 'DELETE')).status, 200);
  const removed = requests.find((entry) => entry.settings.method === 'DELETE');
  assert.deepEqual(removed.payload, [{ type: 'TXT', name: '@', value: 'verification-value' }]);
}));

test('nameservers, autorenew, contacts and DNS lookup follow the new authenticated endpoints', async () => fixture(async ({ call, add, requests }) => {
  const connectionId = await add();
  await call(`/connections/${connectionId}/sync`, 'POST');
  const domain = (await call('/domains')).data[0];
  assert.equal((await call(`/domains/${domain.id}/autorenew`, 'PUT', { isEnabled: false })).status, 200);
  assert.equal((await call('/domains')).data[0].auto_renew, 0);
  assert.equal((await call(`/domains/${domain.id}/nameservers`, 'PUT', { hosts: ['ns1.example.net', 'ns2.example.net'] })).status, 200);
  assert.ok(requests.some((entry) => entry.payload.provider === 'custom'));
  assert.equal((await call('/contacts', 'POST', { connectionId, contact: { firstName: 'Dummy' } })).data.contactId, 'contact-id');
  assert.deepEqual((await call('/lookup?domain=example.com&type=A')).data.records, ['203.0.113.5']);
}));

test('payments are bookkeeping only and provider billing never exposes full card numbers', async () => fixture(async ({ call, add }) => {
  const payment = await call('/payments', 'POST', { name: 'Card', type: 'card', last4: '1234' });
  assert.equal(payment.status, 200);
  assert.equal((await call('/payments', 'POST', { name: 'Unsafe', type: 'card', account: '4111111111111111' })).status, 400);
  assert.equal((await call('/payments', 'POST', { name: 'Unsafe', type: 'card', last4: '1234', cvv: '123' })).status, 400);
  await call(`/payments/${payment.data.id}/default`, 'POST');
  assert.equal((await call('/payments')).data[0].isDefault, true);
  await add('cloudflare');
  const synced = await call('/payments/sync', 'POST');
  assert.equal(synced.data.items[0].last4, '1111');
  assert.ok(!JSON.stringify(synced).includes('4111111111111111'));
  assert.equal((await call('/payments', 'GET', null, 'viewer')).status, 403);
}));

test('custom HTTPS JSON manifest validates, authenticates and maps domains without exposing credentials', async () => fixture(async ({ call }) => {
  const manifest = { id: 'myregistrar', name: 'My registrar', fields: [{ key: 'apiKey', label: 'API key', required: true }], request: { baseUrl: 'https://api.example.com', auth: { type: 'header', map: { Authorization: 'Bearer {apiKey}' } } }, ops: { test: { path: '/account' }, listDomains: { path: '/domains', itemsPath: 'items', map: { name: 'name', expirationDate: 'expirationDate', autoRenew: { path: 'autoRenew', format: 'bool' } } } } };
  assert.equal((await call('/providers/custom/validate', 'POST', { manifest })).status, 200);
  assert.equal((await call('/providers/custom', 'POST', { manifest })).status, 200);
  const bound = await call('/connections', 'POST', { provider: manifest.id, name: 'Custom', credentials: { apiKey: 'test-secret' } });
  assert.equal(bound.status, 200);
  const synced = await call(`/connections/${bound.data.id}/sync`, 'POST');
  assert.equal(synced.status, 200, synced.message);
  assert.equal((await call('/domains')).data[0].provider, manifest.id);
  assert.equal((await call(`/providers/custom/${manifest.id}`, 'DELETE')).status, 409);
  assert.ok(!JSON.stringify((await call('/connections')).data).includes('test-secret'));
}));

test('XML manifests map single and repeated Namecheap domain elements, reject DTD and XXE', async () => {
  const provider = new ManifestProvider(presets.find((item) => item.id === 'namecheap'), { apiKey: 'dummy', apiSecret: 'dummy', clientIp: '203.0.113.1' }, async (url) => {
    assert.equal(new URL(url).searchParams.get('ApiKey'), 'dummy');
    return new Response('<ApiResponse Status="OK"><CommandResponse><DomainGetListResult><Domain Name="xml.example" Expires="2030-01-01" AutoRenew="true" /></DomainGetListResult></CommandResponse></ApiResponse>');
  });
  assert.equal((await provider.domains())[0].name, 'xml.example');
  assert.throws(() => parseXML('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>'));
  assert.throws(() => parseXML('<x><y></x>'));
});

test('custom network targets reject loopback, metadata and private addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(publicAddress(address), false);
  for (const url of ['http://api.example.com', 'https://127.0.0.1', 'https://169.254.169.254', 'https://user:pass@api.example.com', 'https://api.example.com:8443']) assert.throws(() => publicURL(url));
  assert.equal(publicAddress('1.1.1.1'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  assert.throws(() => validateManifest({ ...presets[0], request: { baseUrl: 'https://127.0.0.1' } }));
});

test('notification configuration is encrypted, omitted secrets retained, successful reminders deduplicated', async () => {
  let deliveries = 0;
  await fixture(async ({ call, database, key }) => {
    const days = new Date(Date.now() + 5 * 86400000).toISOString();
    await call('/domains', 'POST', { name: 'expiring.example', expiresAt: days });
    const config = { enabled: true, expiryDays: [30, 7, 1], channels: [{ name: 'Alerts', type: 'webhook', enabled: true, config: { url: 'https://hooks.example.com/private-token' } }] };
    assert.equal((await call('/notifications', 'PUT', config)).status, 200);
    const publicConfig = await call('/notifications');
    assert.ok(!JSON.stringify(publicConfig).includes('private-token'));
    const saved = database.prepare('SELECT * FROM notification_channels').get();
    assert.ok(!saved.config.includes('private-token'));
    assert.equal(decrypt(key, saved.config).url, config.channels[0].config.url);
    assert.equal((await call('/notifications', 'PUT', publicConfig.data)).status, 200);
    const service = createNotificationService(database, { key, notificationTransport: async () => { deliveries += 1; return Response.json({ ok: true }); } });
    assert.equal((await service.run()).sent, 1);
    assert.equal((await service.run()).sent, 0);
    assert.equal(deliveries, 1);
    assert.equal((await call('/notifications/log')).data.length, 1);
    assert.equal((await call('/notifications/test', 'POST', null, 'viewer')).status, 403);
  });
});

test('all seven notification transports use expected payloads; remote error acknowledgements fail', async () => {
  const cases = [
    { type: 'telegram', config: { botToken: '123:dummy-token', chatId: '123' } },
    { type: 'wecom', config: { webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=dummy' } },
    { type: 'feishu', config: { webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/dummy' } },
    { type: 'dingtalk', config: { webhook: 'https://oapi.dingtalk.com/robot/send?access_token=dummy', secret: 'dummy-secret' } },
    { type: 'bark', config: { server: 'https://api.day.app', deviceKey: 'dummy-device' } },
    { type: 'webhook', config: { url: 'https://hooks.example.com/notify', headers: '{"Authorization":"Bearer dummy"}' } },
  ];
  for (const channel of cases) {
    await deliver(channel, { title: 'Test', text: 'Body' }, async (url, settings) => {
      assert.equal(settings.redirect, 'error');
      if (channel.type === 'dingtalk') assert.ok(new URL(url).searchParams.get('sign'));
      assert.ok(settings.body.includes('Body'));
      return Response.json({ ok: true });
    });
  }
  let emailSent = false;
  await deliver({ type: 'email', config: { host: 'smtp.example.com', port: '465', from: 'alerts@example.com', to: 'recipient@example.com', user: 'alerts@example.com', pass: 'dummy-pass' } }, { title: 'Test', text: 'Body' }, undefined, async () => { emailSent = true; return { ok: true }; });
  assert.equal(emailSent, true);
  await assert.rejects(deliver(cases[1], { title: 'Test', text: 'Body' }, async () => Response.json({ errcode: 40013 })), /returned an error/);
  assert.throws(() => mailAddress('attacker@example.com\r\nBcc: victim@example.com'));
});

test('legacy migration preserves password hashes and encrypts credentials; failure rolls all tables back', async () => {
  const passwordHash = await hashPassword('legacy-test-password');
  const snapshot = {
    users: [{ id: 'old-admin', username: 'legacyadmin', passwordHash, roleCodes: ['super'], status: 'active' }],
    roles: [{ id: 'legacy-role', code: 'reader', name: 'Reader', permissions: ['domain:read'] }],
    config: { connections: [{ id: 'old-connection', provider: 'porkbun', name: 'Porkbun', credentials: { apiKey: 'dummy-key', apiSecret: 'dummy-secret' } }] },
    domains: [{ name: 'migrated.example', connectionId: 'old-connection', expirationDate: '2030-01-01' }],
    payments: [{ name: 'Card', type: 'card', account: '4111111111111111' }],
    orders: [{ domain: 'migrated.example', status: 'succeeded', amount: 12 }],
  };
  const key = randomBytes(32);
  const database = openDatabase(':memory:');
  try {
    assert.throws(() => importLegacy(database, key, { ...snapshot, domains: [{ name: '../invalid' }] }));
    assert.equal(database.prepare('SELECT count(*) AS count FROM users').get().count, 0);
    const result = importLegacy(database, key, snapshot);
    assert.equal(result.connections, 1);
    assert.ok(await authenticateAccount(database, 'legacyadmin', 'legacy-test-password'));
    assert.ok(!database.prepare('SELECT credentials FROM connections').get().credentials.includes('dummy-secret'));
    assert.equal(JSON.parse(database.prepare('SELECT details_json FROM payments').get().details_json).last4, '1111');
    assert.equal(JSON.parse(database.prepare("SELECT value FROM settings WHERE id='safety'").get().value).billingEnabled, false);
    assert.throws(() => importLegacy(database, key, snapshot), /empty destination/);
  } finally { database.close(); }
});

test('account profiles, reset-password alias, self password change, deletion and last-admin protection', async () => fixture(async ({ call, admin, viewer, database, tokens }) => {
  assert.equal((await call(`/accounts/${admin.id}`, 'PUT', { username: 'admin', role: 'viewer', status: 'active', currentPassword: 'admin-test-password' })).status, 400);
  assert.equal((await call(`/accounts/${admin.id}`, 'DELETE')).status, 400);
  assert.equal((await call(`/accounts/${viewer.id}`, 'PUT', { username: 'newviewer', role: 'viewer', status: 'active', realName: 'Test user', email: 'test@example.com' })).status, 200);
  assert.equal((await call('/accounts')).data.find((account) => account.id === viewer.id).realName, 'Test user');
  assert.equal((await call(`/accounts/${viewer.id}/password`, 'POST', { password: 'replacement-password' })).status, 200);
  assert.ok(await authenticateAccount(database, 'newviewer', 'replacement-password'));
  tokens.viewer = createSession(database, viewer.id).accessToken;
  assert.equal((await call('/auth/change-password', 'POST', { currentPassword: 'wrong', password: 'viewer-new-password' }, 'viewer')).status, 400);
  assert.equal((await call('/auth/change-password', 'POST', { currentPassword: 'replacement-password', password: 'viewer-new-password' }, 'viewer')).status, 200);
  assert.equal((await call('/user/info', 'GET', null, 'viewer')).status, 401);
  assert.equal((await call(`/accounts/${viewer.id}`, 'DELETE')).status, 200);
  assert.equal(database.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(viewer.id).count, 0);
}));

test('domain metadata, import validation and overview keep financial and audit data permission-scoped', async () => fixture(async ({ call, database }) => {
  const domain = await call('/domains', 'POST', { name: 'local.example', notes: 'first' });
  assert.equal((await call(`/domains/${domain.data.id}`, 'PATCH', { notes: 'revised', expiresAt: '2030-01-01' })).status, 200);
  assert.equal((await call(`/domains/${domain.data.id}`)).data.notes, 'revised');
  assert.equal((await call('/domains/import', 'POST', { domains: [{ name: 'valid.example' }, { name: 'invalid.example', expiresAt: 'not-a-date' }] })).status, 400);
  assert.equal(database.prepare('SELECT count(*) AS count FROM domains').get().count, 1);
  const admin = (await call('/overview')).data;
  assert.ok(Object.hasOwn(admin, 'orders'));
  assert.ok(Object.hasOwn(admin, 'recentActivity'));
  const viewer = (await call('/overview', 'GET', null, 'viewer')).data;
  assert.ok(!Object.hasOwn(viewer, 'orders'));
  assert.ok(!Object.hasOwn(viewer, 'spendThisYear'));
  assert.ok(!Object.hasOwn(viewer, 'recentActivity'));
  assert.equal((await call('/registrars', 'GET', null, 'viewer')).status, 200);
  assert.equal((await call('/connections', 'GET', null, 'viewer')).status, 403);
}));

test('quotes select the exact Spaceship term and total Porkbun prices before billing confirmation', () => {
  const twoYear = { amount: '29.99', currency: 'USD' };
  const tiers = { prices: { renew: [...quotes.prices.renew, { period: { value: 2, unit: 'y' }, priceInDefaultCurrency: { finalPrice: twoYear } }] } };
  assert.deepEqual(priceOf(tiers, 'renew', 2), twoYear);
  assert.equal(priceOf(tiers, 'renew', 3), null);
  assert.deepEqual(priceOf({ result: { price: '12.34', additional: { renewal: { price: '14.50' } } } }, 'renew', 2), { amount: '29.00', currency: 'USD' });
});

test('custom manifests paginate with bounded cursors and abort repeated pages', async () => {
  const manifest = { ...presets[0], ops: { ...presets[0].ops, listDomains: { ...presets[0].ops.listDomains, query: { marker: '{cursor}' }, pagination: { pageSize: 1 } } } };
  const credentials = { apiKey: 'fixture-key', apiSecret: 'fixture-secret' };
  const calls = [];
  const provider = new ManifestProvider(manifest, credentials, async (url) => {
    calls.push(url);
    const cursor = new URL(url).searchParams.get('marker');
    return Response.json(cursor ? [] : [{ domain: 'paginated.example', expires: '2030-01-01', renewAuto: true }]);
  });
  assert.equal((await provider.domains()).length, 1);
  assert.match(calls[1], /marker=paginated.example/);
  const broken = new ManifestProvider(manifest, credentials, async () => Response.json([{ domain: 'repeated.example' }]));
  await assert.rejects(broken.domains(), /pagination repeated/);
});

test('remaining legacy management actions validate saved payments, DNS service labels, and missing order states', async () => fixture(async ({ call }) => {
  const payment = await call('/payments', 'POST', { name: 'Expired fixture', type: 'card', last4: '1234', expiry: '2000-01' });
  const checked = await call('/payments/verify', 'POST', { paymentMethodId: payment.data.id });
  assert.equal(checked.data.valid, false);
  assert.ok(checked.data.issues.includes('Card has expired'));
  assert.equal((await call('/payments/verify', 'POST', { paymentMethodId: 'missing' })).status, 404);
  assert.equal((await call('/lookup?domain=_sip._tcp.example.com&type=srv')).status, 200);
  assert.equal((await call('/lookup?domain=_dmarc.example.com&type=TXT&server=127.0.0.1')).status, 400);
  assert.equal((await call('/orders/missing/sync', 'POST')).status, 404);
  assert.equal((await call('/providers/custom/godaddy', 'DELETE')).status, 409);
  const domain = await call('/domains', 'POST', { name: 'byname.example' });
  assert.equal((await call('/domains/byname.example')).data.id, domain.data.id);
}));

test('account managers cannot promote themselves or reset and delete administrators', async () => fixture(async ({ call, viewer, admin, tokens, database }) => {
  const role = await call('/roles', 'POST', { name: 'Account manager', permissions: ['account:write'] });
  await call(`/accounts/${viewer.id}/roles`, 'PUT', { roleIds: [role.data.id] });
  tokens.viewer = createSession(database, viewer.id).accessToken;
  assert.equal((await call(`/accounts/${viewer.id}`, 'PUT', { username: 'viewer', role: 'admin', status: 'active', currentPassword: 'viewer-test-password' }, 'viewer')).status, 403);
  assert.equal((await call(`/accounts/${admin.id}/password`, 'POST', { password: 'attacker-password' }, 'viewer')).status, 403);
  assert.equal((await call(`/accounts/${admin.id}`, 'DELETE', null, 'viewer')).status, 403);
  assert.equal((await call('/accounts', 'POST', { username: 'promoted', password: 'attacker-password', role: 'admin', status: 'active' }, 'viewer')).status, 403);
}));

test('administrators can assign a role without inherited domain read access and session permissions remain exact', async () => fixture(async ({ call, viewer, tokens, database }) => {
  const role = await call('/roles', 'POST', { name: 'Settings reader', permissions: ['settings:read'] });
  await call(`/accounts/${viewer.id}/roles`, 'PUT', { roleIds: [role.data.id], inheritViewer: false });
  tokens.viewer = createSession(database, viewer.id).accessToken;
  assert.deepEqual((await call('/user/info', 'GET', null, 'viewer')).data.permissions, ['settings:read']);
  assert.equal((await call('/system/status', 'GET', null, 'viewer')).status, 200);
  assert.equal((await call('/overview', 'GET', null, 'viewer')).status, 403);
  assert.equal((await call('/domains', 'GET', null, 'viewer')).status, 403);
  assert.equal((await call('/accounts')).data.find((account) => account.id === viewer.id).inheritViewer, false);
}));

test('legacy migration retains restrictive roles, notification delivery history and linked payment orders', async () => {
  const database = openDatabase(':memory:');
  const key = randomBytes(32);
  try {
    const passwordHash = await hashPassword('migration-fixture-password');
    importLegacy(database, key, {
      users: [{ username: 'admin', passwordHash, roleCodes: ['super'] }, { username: 'auditor', passwordHash, roleCodes: ['auditonly'] }],
      roles: [{ id: 'auditonly', code: 'auditonly', name: 'Audit only', permissions: ['audit:read'] }],
      payments: [{ id: 'oldpayment', type: 'card', name: 'Card', account: '4111111111111111' }],
      orders: [{ domain: 'fixture.example', paymentMethodId: 'oldpayment', note: 'Original note' }],
      notifications: { channels: [{ id: 'oldchannel', type: 'webhook', name: 'Fixture', config: { url: 'https://hooks.example.com/private' } }] },
      notificationState: { sent: { 'fixture.example|7|2030-01-01': 1700000000000 }, log: [{ channel: 'Fixture', domain: 'fixture.example', ok: true }] },
    });
    const viewer = database.prepare("SELECT * FROM users WHERE username='auditor'").get();
    const rolePermissions = (await import('../src/permissions.js')).userPermissions(database, viewer);
    assert.deepEqual(rolePermissions, ['audit:read']);
    const details = JSON.parse(database.prepare('SELECT details_json FROM orders').get().details_json);
    assert.equal(details.paymentMethodId, database.prepare('SELECT id FROM payments').get().id);
    assert.equal(details.note, 'Original note');
    assert.equal(database.prepare('SELECT count(*) AS count FROM notification_log').get().count, 1);
    assert.equal(database.prepare('SELECT dedupe_key FROM notification_sent').get().dedupe_key, 'legacy|fixture.example|2030-01-01|7');
  } finally { database.close(); }
});

test('unpriced legacy registrars expose renewal quotes and require explicit unpriced billing consent', async () => {
  let renewals = 0;
  await fixture(async ({ call }) => {
    const manifest = { id: 'unpricedfixture', name: 'Unpriced fixture', fields: [{ key: 'apiKey', label: 'Key', required: true }], request: { baseUrl: 'https://registrar.example.com', auth: { type: 'none' } }, ops: { listDomains: { path: '/domains' }, renew: { path: '/renew', method: 'POST', body: { years: '{years}' } } } };
    await call('/providers/custom', 'POST', { manifest });
    const connectionId = (await call('/connections', 'POST', { provider: manifest.id, name: 'Fixture', credentials: { apiKey: 'fixture-key' } })).data.id;
    const quotes = await call(`/availability?domain=fixture.example&connectionId=${connectionId}`);
    assert.equal(quotes.data.quotes[0].unpriced, true);
    assert.equal(quotes.data.quotes[0].supports.renew, true);
    assert.equal(quotes.data.quotes[0].prices.renew, null);
    await call(`/connections/${connectionId}/sync`, 'POST');
    const domain = (await call('/domains')).data[0];
    await call('/settings', 'PUT', { safety: { billingEnabled: true } });
    const purchase = { requestId: 'unpriced-renewal-fixture', confirm: true };
    assert.equal((await call(`/domains/${domain.id}/renew`, 'POST', purchase)).status, 409);
    assert.equal(renewals, 0);
    assert.equal((await call(`/domains/${domain.id}/renew`, 'POST', { ...purchase, acceptUnpriced: true })).status, 200);
    assert.equal(renewals, 1);
  }, { transport: async (url) => {
    if (url.endsWith('/domains')) return Response.json([{ name: 'fixture.example' }]);
    renewals += 1;
    return Response.json({ ok: true });
  } });
});

test('Spaceship renewal fetches authoritative expiry and transfer omits registration-only fields and stored auth codes', async () => fixture(async ({ call, add, requests }) => {
  const connectionId = await add();
  await call(`/connections/${connectionId}/sync`, 'POST');
  const domain = (await call('/domains')).data[0];
  await call(`/domains/${domain.id}`, 'PATCH', { expiresAt: '2029-01-01' });
  await call('/settings', 'PUT', { safety: { billingEnabled: true } });
  const renewal = await call(`/domains/${domain.id}/renew`, 'POST', { requestId: 'renewal-request-0001', confirm: true, expectedPrice: price });
  assert.equal(renewal.status, 200, renewal.message);
  const write = requests.find((entry) => entry.url.endsWith('/renew'));
  assert.deepEqual(write.payload, { years: 1, currentExpirationDate: '2030-01-01T00:00:00.000Z' });
  const transfer = await call('/transfer', 'POST', { domain: 'incoming.example', connectionId, requestId: 'transfer-request-0001', confirm: true, expectedPrice: price, contacts: { registrant: 'contact-one' }, authCode: 'fixture-transfer-code' });
  assert.equal(transfer.status, 200, transfer.message);
  const payload = requests.find((entry) => entry.url.endsWith('/incoming.example/transfer')).payload;
  assert.ok(!Object.hasOwn(payload, 'years'));
  assert.equal(payload.authCode, 'fixture-transfer-code');
  assert.ok(!JSON.stringify((await call('/orders')).data).includes('fixture-transfer-code'));
}));
