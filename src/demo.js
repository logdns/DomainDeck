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
  if (url.hostname === 'api.cloudflare.com') {
    if (url.pathname.endsWith('/registrar/domain-check')) {
      const payload = options.body ? JSON.parse(options.body) : {};
      return Response.json({ success: true, result: { domains: (payload.domains || []).map((name) => ({ name, registrable: true, pricing: { registration_cost: '9.99', renewal_cost: '10.99', currency: 'USD' } })) } });
    }
    if (url.pathname.endsWith('/registrar/registrations') && options.method === 'POST') return Response.json({ success: true, result: { domain_name: JSON.parse(options.body).domain_name, state: 'in_progress', completed: false } }, { status: 202 });
    if (url.pathname.endsWith('/registration-status')) return Response.json({ success: true, result: { state: 'succeeded', completed: true } });
    if (url.pathname.endsWith('/transfer-in') && options.method === 'POST') return Response.json({ success: true, result: { domain_name: url.pathname.split('/').at(-2), state: 'pending', completed: false } }, { status: 202 });
    if (url.pathname.endsWith('/transfer-in-status')) return Response.json({ success: true, result: { domain_name: url.pathname.split('/').at(-2), state: 'blocked', completed: false, context: { action: 'Waiting for the losing registrar.' } } });
    if (url.pathname.endsWith('/dnssec')) return Response.json({ success: true, result: { status: 'disabled' } });
    if (url.pathname === '/client/v4/zones' && url.searchParams.has('name')) return Response.json({ success: true, result: [{ id: 'c'.repeat(32), name: url.searchParams.get('name'), status: 'active' }] });
    if (url.pathname.endsWith('/zones')) return Response.json({ success: true, result: [{ id: 'b'.repeat(32), name: 'cloudflare.example', status: 'active' }], result_info: { total_pages: 1 } });
    if (url.pathname.includes('/dns_records')) return Response.json({ success: true, result: [{ id: 'demo-record', type: 'TXT', name: 'cloudflare.example', content: 'demo-only', ttl: 1 }], result_info: { total_pages: 1 } });
    return Response.json({ success: true, result: {} });
  }
  throw new Error('External requests are disabled in demo mode');
}
