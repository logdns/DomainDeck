import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Provider, validateCredentials } from '../src/providers.js';

test('Spaceship official headers, take/skip pagination and expiry mapping', async () => {
  const calls = [];
  const provider = new Provider('spaceship', { apiKey: 'dummy-key', apiSecret: 'dummy-secret' }, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ items: [{ name: 'spaceship.example', expirationDate: '2031-01-01', autoRenew: true }], total: 1 });
  });
  assert.deepEqual(await provider.domains(), [{ name: 'spaceship.example', remoteId: 'spaceship.example', expiresAt: '2031-01-01', autoRenew: true }]);
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
