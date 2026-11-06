import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ManifestProvider, valueAt, parseXML } from '../src/manifests.js';

const manifest = {
  id: 'legacyfixture', name: 'Legacy fixture',
  fields: [{ key: 'username', label: 'User', required: true }, { key: 'password', label: 'Password', required: true }],
  request: { baseUrl: 'https://registrar.example.com', auth: { type: 'basic', user: 'username', pass: 'password' } },
  ops: {
    listDomains: { path: '/domains', itemsPath: 'items', map: { name: 'domain', expirationDate: { path: 'expires', format: 'unix' }, autoRenew: { path: 'renew', format: 'bool' } } },
    availability: { path: '/price', resultPath: 'response' },
    renew: { path: '/renew', method: 'POST', cost: { path: 'price', multiply: 100, byYears: true }, body: { $input: true, amount: '{cost}', years: { $fmt: 'int', value: '{years}' }, renewal: { $when: 'isEnabled', true: '{username}', false: 'off' } } },
    createDns: { path: '/dns', method: 'POST', body: { $input: true } },
  },
};
const credentials = { username: 'fixture-user', password: 'fixture-password' };

test('old manifest operators retain input, types, credential field authentication and selected cost paths', async () => {
  let submitted;
  const adapter = new ManifestProvider(manifest, credentials, async (url, options) => {
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`);
    if (url.endsWith('/price')) return Response.json({ response: { price: '12.50' } });
    submitted = JSON.parse(options.body);
    return Response.json({ ok: true });
  });
  await adapter.execute('renew', { years: '2', isEnabled: true, expectedAmount: 25, input: { note: 'retained', username: 'untrusted-input' } });
  assert.deepEqual(submitted, { note: 'retained', username: 'untrusted-input', amount: 2500, years: 2, renewal: 'fixture-user' });
  await assert.rejects(adapter.execute('renew', { years: 2, expectedAmount: 1 }), /Price changed/);
});

test('test fallback, date mappings and XML text aliases preserve old custom provider behavior', async () => {
  const adapter = new ManifestProvider(manifest, credentials, async () => Response.json({ items: [{ domain: 'fixture.example', expires: 1893456000, renew: 'YES' }] }));
  const result = await adapter.execute('test');
  assert.equal(result.result[0].name, 'fixture.example');
  assert.equal(result.result[0].expiresAt, '2030-01-01T00:00:00.000Z');
  assert.equal(result.result[0].autoRenew, true);
  assert.equal(valueAt(parseXML('<Root><Text>hello &amp; world</Text></Root>'), 'Root.Text.#text'), 'hello & world');
});

test('custom DNS maps relative names, TTL, priority and comment without Cloudflare-only fields', async () => {
  let submitted;
  const adapter = new ManifestProvider({ ...manifest, dns: { nameMode: 'subdomain', minTTL: 600, priorityKey: 'prio', commentKey: 'notes' } }, credentials, async (_url, options) => { submitted = JSON.parse(options.body); return Response.json({ ok: true }); });
  await adapter.writeRecord({ name: 'fixture.example', remote_id: 'zone' }, { type: 'MX', name: 'mail.fixture.example', content: 'smtp.example.net', ttl: 60, priority: 5, comment: 'Fixture', proxied: true, proxiable: true });
  assert.deepEqual(submitted, { type: 'MX', name: 'mail', content: 'smtp.example.net', ttl: 600, prio: 5, notes: 'Fixture' });
  await assert.rejects(adapter.writeRecord({ name: 'fixture.example' }, { type: 'A', name: '@', content: '1.1.1.1', ttl: 'invalid' }), /TTL/);
});

test('explicitly disabled custom operations fail without an external request', async () => {
  let called = false;
  const adapter = new ManifestProvider({ ...manifest, capabilities: { renew: false } }, credentials, async () => { called = true; return Response.json({}); });
  await assert.rejects(adapter.execute('renew'), /disabled/);
  assert.equal(called, false);
});
