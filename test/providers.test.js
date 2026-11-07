import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Provider, searchDomainName, validateCredentials } from '../src/providers.js';

test('domain search adds or repairs common suffixes without changing complete names', () => {
  assert.equal(searchDomainName('brand'), 'brand.com');
  assert.equal(searchDomainName('brandcom'), 'brand.com');
  assert.equal(searchDomainName('brandcomcn'), 'brand.com.cn');
  assert.equal(searchDomainName('https://Brand.NET/path'), 'brand.net');
  assert.equal(searchDomainName('brand.co.uk'), 'brand.co.uk');
  assert.throws(() => searchDomainName('not a domain'), /Invalid domain/);
});

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

test('Cloudflare DNS zone and record reads follow the zone-scoped API contract', async () => {
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'fixture-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/dns_records')) return Response.json({ success: true, result: [{ id: 'record-id', type: 'A', name: 'www.example.com', content: '203.0.113.10', ttl: 1, proxied: true }], result_info: { total_pages: 1 } });
    return Response.json({ success: true, result: [{ id: 'b'.repeat(32), name: 'example.com', status: 'active', name_servers: ['ns1.example.net'] }], result_info: { total_pages: 1 } });
  });
  const [zone] = await provider.domains();
  const records = await provider.records({ name: zone.name, remote_id: zone.remoteId });
  assert.equal(new URL(calls[0].url).searchParams.get('account.id'), 'a'.repeat(32));
  assert.equal(new URL(calls[1].url).pathname, `/client/v4/zones/${'b'.repeat(32)}/dns_records`);
  assert.deepEqual(records.map(({ id, name, content, proxied }) => ({ id, name, content, proxied })), [{ id: 'record-id', name: 'www.example.com', content: '203.0.113.10', proxied: true }]);
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

test('Cloudflare registrar checks, registrations and operation polling use documented v4 endpoints', async () => {
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'fixture-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push({ url, ...options, payload: options.body ? JSON.parse(options.body) : undefined });
    if (url.endsWith('/registrar/domain-check')) return Response.json({ success: true, result: { domains: [{ name: 'new.example.com', registrable: true, pricing: { registration_cost: '9.99', renewal_cost: '10.99', currency: 'USD' } }] } });
    if (url.endsWith('/registrar/registrations')) return Response.json({ success: true, result: { domain_name: 'new.example.com', state: 'in_progress', completed: false } }, { status: 202 });
    return Response.json({ success: true, result: { domain_name: 'new.example.com', state: 'succeeded', completed: true } });
  });
  const check = await provider.execute('availability', { domain: 'new.example.com' });
  assert.equal(check.result.domains[0].registrable, true);
  const registration = await provider.execute('register', { domain: 'new.example.com', input: { autoRenew: true } });
  assert.equal(registration.accepted, true);
  assert.equal(registration.operationId, 'new.example.com');
  const result = await provider.execute('operation', { operationId: registration.operationId });
  assert.equal(result.result.state, 'succeeded');
  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [
    ['POST', '/client/v4/accounts/' + 'a'.repeat(32) + '/registrar/domain-check'],
    ['POST', '/client/v4/accounts/' + 'a'.repeat(32) + '/registrar/registrations'],
    ['GET', '/client/v4/accounts/' + 'a'.repeat(32) + '/registrar/registrations/new.example.com/registration-status'],
  ]);
  assert.deepEqual(calls[1].payload, { domain_name: 'new.example.com', auto_renew: true });
  assert.ok(calls.every((call) => call.headers.Authorization === 'Bearer fixture-token'));
});

test('Cloudflare transfer-in uses documented preflight, base64 EPP code and status endpoints', async () => {
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'fixture-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push({ url, ...options, payload: options.body ? JSON.parse(options.body) : undefined });
    const parsed = new URL(url);
    if (parsed.pathname === '/client/v4/zones') return Response.json({ success: true, result: [{ id: 'b'.repeat(32), name: 'example.com', status: 'active' }] });
    if (parsed.pathname.endsWith('/dnssec')) return Response.json({ success: true, result: { status: 'disabled' } });
    if (parsed.pathname.endsWith('/transfer-in')) return Response.json({ success: true, result: { domain_name: 'example.com', state: 'pending', completed: false } }, { status: 202 });
    return Response.json({ success: true, result: { domain_name: 'example.com', state: 'blocked', completed: false, context: { action: 'await losing registrar' } } });
  });
  const preflight = await provider.execute('transferPreflight', { domain: 'example.com' });
  assert.equal(preflight.result.ready, true);
  const transfer = await provider.execute('transfer', { domain: 'example.com', input: { authCode: 'secret-epp-code', autoRenew: true } });
  assert.equal(transfer.operationId, 'example.com');
  assert.equal(transfer.accepted, true);
  assert.deepEqual(calls[2].payload, { auth_code: Buffer.from('secret-epp-code').toString('base64'), auto_renew: true });
  const status = await provider.execute('operation', { operationId: 'example.com', kind: 'transfer' });
  assert.equal(status.result.state, 'blocked');
  assert.deepEqual(calls.slice(0, 4).map((call) => [call.method, new URL(call.url).pathname]), [
    ['GET', '/client/v4/zones'],
    ['GET', `/client/v4/zones/${'b'.repeat(32)}/dnssec`],
    ['POST', `/client/v4/accounts/${'a'.repeat(32)}/registrar/registrations/example.com/transfer-in`],
    ['GET', `/client/v4/accounts/${'a'.repeat(32)}/registrar/registrations/example.com/transfer-in-status`],
  ]);
  assert.equal(JSON.stringify(calls).includes('secret-epp-code'), false);
});

test('Cloudflare transfer preflight rejects missing or DNSSEC-enabled zones and UK transfer omits EPP code', async () => {
  let dnssec = 'active';
  let zone = true;
  const calls = [];
  const provider = new Provider('cloudflare', { token: 'fixture-token', accountId: 'a'.repeat(32) }, async (url, options) => {
    calls.push({ url, payload: options.body ? JSON.parse(options.body) : undefined });
    const parsed = new URL(url);
    if (parsed.pathname === '/client/v4/zones') return Response.json({ success: true, result: zone ? [{ id: 'b'.repeat(32), name: 'example.uk', status: 'active' }] : [] });
    if (parsed.pathname.endsWith('/dnssec')) return Response.json({ success: true, result: { status: dnssec } });
    return Response.json({ success: true, result: { state: 'pending', completed: false } }, { status: 202 });
  });
  assert.equal((await provider.execute('transferPreflight', { domain: 'example.uk' })).result.ready, false);
  dnssec = 'disabled';
  zone = false;
  assert.equal((await provider.execute('transferPreflight', { domain: 'example.uk' })).result.ready, false);
  zone = true;
  const transfer = await provider.execute('transfer', { domain: 'example.uk', input: { autoRenew: false } });
  assert.equal(transfer.accepted, true);
  assert.deepEqual(calls.at(-1).payload, { auto_renew: false });
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
