import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Provider, validateCredentials } from '../src/providers.js';

test('Spaceship official headers, take/skip pagination and expiry mapping', async () => {
  const calls = [];
  const provider = new Provider('spaceship', { apiKey: 'dummy-key', apiSecret: 'dummy-secret' }, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ items: [{ name: 'spaceship.example', expirationDate: '2031-01-01', autoRenew: true, lifecycleStatus: 'registered', registrationDate: '2020-01-01', nameservers: { provider: 'basic' }, eppStatuses: ['clientTransferProhibited'] }], total: 1 });
  });
  assert.deepEqual(await provider.domains(), [{ name: 'spaceship.example', remoteId: 'spaceship.example', expiresAt: '2031-01-01', autoRenew: true, metadata: { status: 'registered', registrationDate: '2020-01-01', nameservers: { provider: 'basic' }, isPremium: false, eppStatuses: ['clientTransferProhibited'] } }]);
  assert.equal(calls[0].url, 'https://spaceship.dev/api/v1/domains?take=100&skip=0');
  assert.equal(calls[0].options.headers['X-API-Secret'], 'dummy-secret');
  assert.equal(calls[0].options.redirect, 'error');
});

test('Cloudflare uses bearer credentials and handles all zone pages', async () => {
  let count = 0;
  const provider = new Provider('cloudflare', { token: 'dummy-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    count += 1;
    assert.equal(options.headers.Authorization, 'Bearer dummy-token');
    assert.equal(new URL(url).searchParams.get('page'), String(count));
    return Response.json({ success: true, result: [{ name: `page${count}.example`, id: String(count).repeat(32) }], result_info: { total_pages: 2 } });
  });
  assert.equal((await provider.domains()).length, 2);
});

test('provider errors are sanitized, invalid credentials and DNS fields rejected', async () => {
  assert.throws(() => validateCredentials('custom', {}));
  const provider = new Provider('porkbun', { apiKey: 'dummy-key', secretKey: 'dummy-secret' }, async () => Response.json({ status: 'ERROR', message: 'dummy-secret' }, { status: 403 }));
  await assert.rejects(provider.domains(), (error) => !error.message.includes('dummy-secret'));
  await assert.rejects(provider.writeRecord({ name: 'example.com' }, { type: 'INVALID', content: '1' }), /Invalid DNS/);
});

test('Porkbun paid requests use integer cents, recheck price and reject drift before sending an order', async () => {
  const writes = [];
  const provider = new Provider('porkbun', { apiKey: 'dummy-key', secretKey: 'dummy-secret' }, async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.apikey, 'dummy-key');
    assert.equal(body.secretapikey, 'dummy-secret');
    if (url.includes('/checkDomain/')) return Response.json({ status: 'SUCCESS', response: { price: '9.85', additional: { renewal: { price: '10.99' } } } });
    writes.push({ url, body });
    return Response.json({ status: 'SUCCESS' });
  });
  await provider.execute('renew', { domain: 'example.com', years: 2, expectedAmount: '10.99' });
  assert.equal(writes[0].body.cost, 2198);
  assert.equal(writes[0].body.years, '2');
  await assert.rejects(provider.execute('register', { domain: 'new.example', expectedAmount: '1.00' }), /Price changed/);
  assert.equal(writes.length, 1);
});

test('Cloudflare registrar quote uses POST, DNS edits preserve proxy/comment and cache purge targets the zone', async () => {
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'dummy-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push({ url, ...options, payload: options.body ? JSON.parse(options.body) : undefined });
    return Response.json({ success: true, result: {} });
  });
  await provider.execute('availability', { domain: 'example.com' });
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/registrar\/domain-check$/);
  assert.deepEqual(calls[0].payload, { domains: ['example.com'] });
  await provider.writeRecord({ name: 'example.com', remote_id: 'b'.repeat(32) }, { type: 'A', name: '@', content: '203.0.113.1', ttl: 1, proxied: true, comment: 'managed' }, 'c'.repeat(32));
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].payload.proxied, true);
  assert.equal(calls[1].payload.comment, 'managed');
  await provider.execute('purge', { zoneId: 'b'.repeat(32) });
  assert.deepEqual(calls[2].payload, { purge_everything: true });
});

test('Spaceship DNS forms map MX, SRV, ALIAS and PTR to official fields', async () => {
  const calls = [];
  const provider = new Provider('spaceship', { apiKey: 'fixture', apiSecret: 'fixture' }, async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return Response.json({});
  });
  const domain = { name: 'example.com' };
  await provider.writeRecord(domain, { type: 'MX', name: '@', content: 'mail.example.com', priority: 10 });
  await provider.writeRecord(domain, { type: 'SRV', name: '_sip._tcp.voip', target: 'sip.example.com', priority: 5, weight: 7, port: 5060 });
  await provider.writeRecord(domain, { type: 'ALIAS', name: '@', content: 'edge.example.com' });
  await provider.writeRecord(domain, { type: 'PTR', name: '1', content: 'host.example.com' });
  assert.deepEqual(calls[0].body.items[0], { type: 'MX', name: '@', ttl: 600, exchange: 'mail.example.com', preference: 10 });
  assert.deepEqual(calls[1].body.items[0], { type: 'SRV', name: 'voip', ttl: 600, target: 'sip.example.com', service: '_sip', protocol: '_tcp', priority: 5, weight: 7, port: 5060 });
  assert.equal(calls[2].body.items[0].aliasName, 'edge.example.com');
  assert.equal(calls[3].body.items[0].pointer, 'host.example.com');
  assert.ok(calls.every((call) => call.method === 'PUT' && call.url === 'https://spaceship.dev/api/v1/dns/records/example.com'));
});

test('Cloudflare accepts Vben structured DNS fields without losing protocol-specific values', async () => {
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'fixture', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ success: true, result: {} });
  });
  const domain = { name: 'example.com', remote_id: 'b'.repeat(32) };
  await provider.writeRecord(domain, { type: 'SRV', name: '_sip._tcp', data: { priority: 10, weight: 5, port: 5060, target: 'sip.example.com' } });
  await provider.writeRecord(domain, { type: 'CAA', name: '@', data: { flags: 128, tag: 'issue', value: 'letsencrypt.org' } });
  await provider.writeRecord(domain, { type: 'TLSA', name: '_443._tcp', data: { usage: 3, selector: 1, matching: 1, certificate: 'abcd' } });
  await provider.writeRecord(domain, { type: 'HTTPS', name: '@', data: { priority: 1, target: '.', value: 'alpn=h2' } });
  assert.deepEqual(calls[0].data, { service: '_sip', proto: '_tcp', name: 'example.com', priority: 10, weight: 5, port: 5060, target: 'sip.example.com' });
  assert.deepEqual(calls[1].data, { flags: 128, tag: 'issue', value: 'letsencrypt.org' });
  assert.deepEqual(calls[2].data, { usage: 3, selector: 1, matching: 1, certificate: 'abcd' });
  assert.deepEqual(calls[3].data, { priority: 1, target: '.', value: 'alpn=h2' });
  await assert.rejects(provider.writeRecord(domain, { type: 'TLSA', name: '_443._tcp', data: { usage: 4, selector: 1, matching: 1, certificate: 'abcd' } }), /Invalid TLSA/);
});
