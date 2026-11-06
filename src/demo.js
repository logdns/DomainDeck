import { randomUUID } from 'node:crypto';
import { encrypt } from './vault.js';

export function seedDemo(database, key) {
  for (const provider of ['spaceship', 'porkbun', 'cloudflare']) {
    const id = randomUUID();
    const credentials = provider === 'cloudflare' ? { token: 'demo', accountId: 'a'.repeat(32) } : provider === 'porkbun' ? { apiKey: 'demo', secretKey: 'demo' } : { apiKey: 'demo', apiSecret: 'demo' };
    database.prepare('INSERT INTO connections(id,name,provider,credentials,created_at) VALUES(?,?,?,?,?)').run(id, `Demo ${provider}`, provider, encrypt(key, credentials), new Date().toISOString());
    database.prepare('INSERT INTO domains(id,name,connection_id,remote_id,expires_at,notes) VALUES(?,?,?,?,?,?)').run(randomUUID(), `${provider}.example`, id, provider === 'cloudflare' ? 'b'.repeat(32) : `${provider}.example`, new Date(Date.now() + 14 * 86400000).toISOString(), 'Isolated demonstration asset');
  }
}

export async function demoTransport(target, options = {}) {
  const url = new URL(target);
  if (url.hostname === 'spaceship.dev') {
    if (url.pathname.endsWith('/pricing')) return Response.json({ prices: Object.fromEntries(['register', 'renew', 'transfer'].map((kind) => [kind, [{ period: { value: 1 }, priceInDefaultCurrency: { finalPrice: { amount: '12.00', currency: 'USD' } } }]])) });
    if (url.pathname.endsWith('/available')) return Response.json({ result: 'available' });
    if (url.pathname.includes('/async-operations/')) return Response.json({ status: 'success' });
    if (options.method && options.method !== 'GET') return new Response(null, { status: 202, headers: { 'spaceship-async-operationid': 'demo-operation' } });
    if (url.pathname.includes('/dns/records/')) return Response.json({ items: [{ type: 'TXT', name: '@', value: 'demo-only', ttl: 600 }], total: 1 });
    const domain = { name: 'spaceship.example', autoRenew: false, expirationDate: new Date(Date.now() + 14 * 86400000).toISOString(), nameservers: { provider: 'basic', hosts: ['launch1.spaceship.net', 'launch2.spaceship.net'] } };
    return Response.json(url.pathname.endsWith('/domains') ? { items: [domain], total: 1 } : domain);
  }
  if (url.hostname === 'api.porkbun.com') {
    if (url.pathname.endsWith('/listAll')) return Response.json({ status: 'SUCCESS', domains: [{ domain: 'porkbun.example', expireDate: new Date(Date.now() + 14 * 86400000).toISOString() }] });
    if (url.pathname.includes('/dns/retrieve')) return Response.json({ status: 'SUCCESS', records: [] });
    return Response.json({ status: 'SUCCESS', response: { price: '12.00', additional: { renewal: { price: '12.00' }, transfer: { price: '12.00' } }, balance: '100', currency: 'USD' } });
  }
  if (url.hostname === 'api.cloudflare.com') return Response.json({ success: true, result: url.pathname.endsWith('/zones') ? [{ id: 'b'.repeat(32), name: 'cloudflare.example' }] : [], result_info: { total_pages: 1 } });
  throw new Error('External requests are disabled in demo mode');
}
