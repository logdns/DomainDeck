import { createHash, randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { domainName, dnsName } from './providers.js';
import { adapterFor } from './registry.js';
import { HttpError, requireValue } from './errors.js';
import { audit, setting, text } from './store.js';
import { can } from './permissions.js';
import { publicAddress } from './network.js';

export function priceOf(result, kind, years = 1) {
  const raw = result?.result ?? result;
  const tier = raw?.prices?.[kind]?.find((item) => !item.period || item.period.value === years);
  const price = tier?.priceInDefaultCurrency?.finalPrice;
  let amount = price?.amount;
  let currency = price?.currency;
  if (amount === undefined && raw?.price !== undefined) {
    amount = kind === 'register' ? raw.price : raw.additional?.[kind === 'renew' ? 'renewal' : 'transfer']?.price ?? raw[kind === 'renew' ? 'renewPrice' : 'transferPrice'];
    currency = 'USD';
  }
  if (raw?.domains) {
    const entry = raw.domains[0];
    amount = entry?.pricing?.[kind === 'register' ? 'registration_cost' : 'renewal_cost'];
    currency = entry?.pricing?.currency;
  }
  if (amount === undefined && raw?.priceInDefaultCurrency?.finalPrice && years === 1) return raw.priceInDefaultCurrency.finalPrice;
  if (!tier && !raw?.prices && amount !== undefined && years > 1) amount = (Number(amount) * years).toFixed(2);
  return amount !== undefined && Number.isFinite(Number(amount)) && Number(amount) >= 0 && currency ? { amount: String(amount), currency: String(currency).toUpperCase() } : null;
}

function orderView(row) {
  return { id: row.id, connectionId: row.connection_id, domain: row.domain, kind: row.kind, status: row.status, operationId: row.operation_id, details: JSON.parse(row.details_json), created_at: row.created_at, updated_at: row.updated_at };
}

async function quote(adapter, name, years) {
  if (adapter.manifest && !adapter.manifest.ops.availability && !adapter.manifest.ops.pricing) return { availability: null, prices: { register: null, renew: null, transfer: null }, unpriced: true };
  let availability;
  let pricing;
  try { availability = await adapter.execute('availability', { domain: name }); }
  catch { if (adapter.provider !== 'spaceship' && !adapter.manifest?.ops.pricing) throw new Error('Quote unavailable'); }
  pricing = adapter.provider === 'spaceship' || adapter.manifest?.ops.pricing ? await adapter.execute('pricing', { domain: name }) : availability;
  return { availability: availability?.result ?? null, prices: Object.fromEntries(['register', 'renew', 'transfer'].map((kind) => [kind, priceOf(pricing, kind, kind === 'transfer' ? 1 : years)])) };
}

export async function commerceResource(database, context) {
  const { path, method, query, body, user } = context;
  const log = (action, target) => audit(database, user, action, target);
  if (path === '/api/v1/registrars' && method === 'GET') return database.prepare("SELECT id,name,COALESCE(NULLIF(provider_ref,''),provider) AS provider FROM connections WHERE enabled=1 AND (roles_json IS NULL OR EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='registrar')) ORDER BY is_default DESC,name").all();
  if (method === 'GET' && ['/api/v1/availability', '/api/v1/transfer/quotes'].includes(path)) {
    const name = domainName(query.get('domain'));
    const years = Number(query.get('years') || 1);
    requireValue(Number.isInteger(years) && years >= 1 && years <= 10, 'Invalid term');
    const connections = database.prepare("SELECT id,name,provider,provider_ref FROM connections WHERE enabled=1 AND (roles_json IS NULL OR EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='registrar')) ORDER BY is_default DESC,name").all();
    const quotes = [];
    for (const bound of connections.filter((row) => !query.get('connectionId') || row.id === query.get('connectionId'))) {
      try {
        const { adapter } = adapterFor(database, context, bound.id);
        quotes.push({ connectionId: bound.id, connectionName: bound.name, provider: bound.provider_ref || bound.provider, supports: Object.fromEntries(['register', 'renew', 'transfer'].map((kind) => [kind, adapter.manifest ? Boolean(adapter.manifest.ops[kind]) : adapter.provider !== 'cloudflare'])), ...(await quote(adapter, name, years)) });
      } catch { quotes.push({ connectionId: bound.id, connectionName: bound.name, error: 'Provider rejected quote or does not expose pricing' }); }
    }
    return { domain: name, years, quotes };
  }
  const actionMatch = /^\/api\/v1\/domains\/([a-zA-Z0-9_.-]+)\/(renew|autorenew|nameservers|auth-code|transfer-lock|details|purge)$/.exec(path);
  const billingKind = path === '/api/v1/register' ? 'register' : path === '/api/v1/transfer' ? 'transfer' : actionMatch?.[2] === 'renew' ? 'renew' : '';
  if (billingKind && method === 'POST') {
    requireValue(setting(database, 'safety').billingEnabled, 'Enable billing in safety settings before purchasing', 409);
    requireValue(body.confirm === true, 'Explicit billing confirmation required');
    requireValue(typeof body.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(body.requestId), 'A unique requestId is required');
    const domain = actionMatch ? database.prepare('SELECT * FROM domains WHERE id=? OR name=?').get(actionMatch[1], actionMatch[1]) : null;
    const name = domainName(domain?.name || body.domain);
    const connectionId = body.connectionId || domain?.connection_id || database.prepare('SELECT id FROM connections WHERE enabled=1 ORDER BY is_default DESC LIMIT 1').get()?.id;
    requireValue(connectionId, 'Select a registrar connection');
    const years = Number(body.years || 1);
    requireValue(Number.isInteger(years) && years >= 1 && years <= 10 && (billingKind !== 'transfer' || years === 1), 'Invalid term');
    const fingerprint = createHash('sha256').update(JSON.stringify({ name, connectionId, years, billingKind, actor: user.id })).digest('hex');
    const prior = database.prepare('SELECT * FROM orders WHERE request_id=?').get(body.requestId);
    if (prior) {
      requireValue(JSON.parse(prior.details_json).fingerprint === fingerprint, 'Request ID is already used for another purchase', 409);
      return { order: orderView(prior), replay: true };
    }
    requireValue(!database.prepare("SELECT id FROM orders WHERE connection_id=? AND domain=? AND kind=? AND status IN ('submitting','pending','needs-review') LIMIT 1").get(connectionId, name, billingKind), 'An unresolved order already exists for this domain. Reconcile it before creating another purchase.', 409);
    const { adapter, bound } = adapterFor(database, context, connectionId);
    requireValue(!bound.roles_json || JSON.parse(bound.roles_json).includes('registrar'), 'This connection is configured for DNS only', 409);
    requireValue(adapter.provider !== 'cloudflare', 'Cloudflare purchases must be completed in its dashboard', 409);
    requireValue(!adapter.manifest || adapter.manifest.ops[billingKind] && adapter.manifest.capabilities?.[billingKind] !== false, 'This provider does not expose that purchase operation', 409);
    const contacts = { ...setting(database, 'contacts'), ...(body.contacts || {}) };
    if (adapter.provider === 'spaceship' && billingKind !== 'renew') {
      requireValue(typeof contacts.registrant === 'string' && contacts.registrant.length > 0, 'Registrant contact ID required');
      for (const field of ['admin', 'tech', 'billing']) if (!contacts[field]) contacts[field] = contacts.registrant;
    }
    if (billingKind === 'transfer') requireValue(typeof body.authCode === 'string' && body.authCode.length > 0 && body.authCode.length <= 200, 'Transfer authorization code required');
    if (billingKind === 'transfer' && adapter.provider === 'spaceship') requireValue(body.authCode.length <= 50, 'Spaceship authorization code must be at most 50 characters');
    const pricing = adapter.manifest && !adapter.manifest.ops.pricing && !adapter.manifest.ops.availability ? {} : await adapter.execute(adapter.provider === 'spaceship' || adapter.manifest?.ops.pricing ? 'pricing' : 'availability', { domain: name });
    const price = priceOf(pricing, billingKind, years);
    if (price) requireValue(body.expectedPrice && String(body.expectedPrice.currency).toUpperCase() === price.currency && Number(body.expectedPrice.amount) === Number(price.amount), 'Price changed or quote missing; query again', 409);
    else requireValue(body.acceptUnpriced === true && Boolean(adapter.manifest), 'No verified quote is available; provider billing is blocked', 409);
    const input = { ...(billingKind === 'register' ? { years } : {}), autoRenew: body.autoRenew === true, contacts, privacyProtection: { level: body.privacyLevel === 'public' ? 'public' : 'high', userConsent: true }, ...(billingKind === 'transfer' ? { authCode: body.authCode } : {}) };
    if (billingKind === 'renew' && adapter.provider === 'spaceship') {
      input.currentExpirationDate = (await adapter.execute('getDomain', { domain: name })).result.expirationDate;
      requireValue(typeof input.currentExpirationDate === 'string' && Number.isFinite(Date.parse(input.currentExpirationDate)), 'Provider did not return the current expiration date', 502);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const details = { years, price, actor: user.username, fingerprint, paymentMethodId: body.paymentMethodId || null, note: 'Charges use the provider account balance or its default payment method; local payment entries are bookkeeping only.' };
    database.prepare('INSERT INTO orders(id,connection_id,domain,kind,status,details_json,created_at,updated_at,request_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id, connectionId, name, billingKind, 'submitting', JSON.stringify(details), now, now, body.requestId);
    log(`domain.${billingKind}.submit`, name);
    try {
      const response = await adapter.execute(billingKind, { domain: name, years, input, expectedAmount: price ? adapter.provider === 'porkbun' ? (Number(price.amount) / years).toFixed(2) : price.amount : undefined });
      database.prepare('UPDATE orders SET status=?,operation_id=?,updated_at=? WHERE id=?').run(response.operationId || response.accepted ? 'pending' : 'completed', response.operationId || '', new Date().toISOString(), id);
      log(`domain.${billingKind}.accepted`, name);
      if (billingKind === 'renew') await context.notifications?.renewal(name).catch(() => {});
    } catch {
      database.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run('needs-review', new Date().toISOString(), id);
      log(`domain.${billingKind}.needs-review`, name);
      throw new HttpError(502, `Provider outcome is unconfirmed. Review order ${id} before making another purchase; do not retry with a new request ID.`);
    }
    return { order: orderView(database.prepare('SELECT * FROM orders WHERE id=?').get(id)) };
  }
  if (actionMatch && actionMatch[2] !== 'renew') {
    const domain = database.prepare('SELECT * FROM domains WHERE id=? OR name=?').get(actionMatch[1], actionMatch[1]);
    requireValue(domain?.connection_id, 'Synced domain not found', 404);
    const { adapter } = adapterFor(database, context, domain.connection_id);
    const action = actionMatch[2];
    const variables = { domain: domain.name, input: body, zoneId: domain.remote_id };
    if (action === 'auth-code' && method === 'GET') return (await adapter.execute('getAuthCode', variables)).result;
    if (action === 'details' && method === 'GET') return (await adapter.execute('getDomain', variables)).result;
    if (action === 'autorenew' && ['PUT', 'PATCH'].includes(method)) {
      requireValue(typeof body.isEnabled === 'boolean', 'Boolean isEnabled required');
      await adapter.execute('setAutoRenew', { ...variables, isEnabled: body.isEnabled });
      database.prepare('UPDATE domains SET auto_renew=? WHERE id=?').run(Number(body.isEnabled), domain.id);
    } else if (action === 'nameservers' && method === 'PUT') {
      requireValue(body.provider === 'basic' || Array.isArray(body.hosts) && body.hosts.length >= 2 && body.hosts.length <= 12, 'Provide 2–12 nameservers');
      const input = body.provider === 'basic' ? { provider: 'basic' } : { provider: 'custom', hosts: body.hosts.map(domainName) };
      await adapter.execute('setNameservers', { ...variables, input, hosts: input.hosts });
    } else if (action === 'transfer-lock' && method === 'PUT') {
      requireValue(typeof body.isLocked === 'boolean', 'Boolean isLocked required');
      await adapter.execute('setTransferLock', { ...variables, isLocked: body.isLocked });
    } else if (action === 'purge' && method === 'POST') await adapter.execute('purge', variables);
    else return;
    log(`domain.${action}`, domain.name);
    return { ok: true };
  }
  const transferMatch = /^\/api\/v1\/transfer\/([a-zA-Z0-9_.-]+)$/.exec(path);
  if (transferMatch && method === 'GET') {
    const name = domainName(transferMatch[1]);
    const connectionId = query.get('connectionId') || database.prepare('SELECT connection_id FROM domains WHERE name=?').get(name)?.connection_id || database.prepare("SELECT connection_id FROM orders WHERE domain=? AND kind='transfer' ORDER BY created_at DESC LIMIT 1").get(name)?.connection_id;
    return (await adapterFor(database, context, connectionId).adapter.execute('transferInfo', { domain: name })).result;
  }
  const operationMatch = /^\/api\/v1\/operations\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (operationMatch && method === 'GET') return (await adapterFor(database, context, query.get('connectionId')).adapter.execute('operation', { operationId: operationMatch[1] })).result;
  if (path === '/api/v1/orders' && method === 'GET') return database.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000').all().map(orderView);
  const orderMatch = /^\/api\/v1\/orders\/([a-zA-Z0-9-]+)(?:\/(sync))?$/.exec(path);
  if ((path === '/api/v1/orders/sync' && method === 'POST') || (orderMatch?.[2] && method === 'POST')) {
    const rows = orderMatch?.[2] ? database.prepare('SELECT * FROM orders WHERE id=?').all(orderMatch[1]) : database.prepare("SELECT * FROM orders WHERE status IN ('pending','submitting','needs-review') AND operation_id!='' LIMIT 100").all();
    requireValue(!orderMatch || rows.length, 'Order not found', 404);
    requireValue(!orderMatch || rows[0].operation_id, 'This order has no asynchronous operation; reconcile it manually', 409);
    const results = [];
    for (const row of rows) {
      if (!row.operation_id || !row.connection_id) continue;
      try {
        const result = (await adapterFor(database, context, row.connection_id).adapter.execute('operation', { operationId: row.operation_id })).result;
        const status = result.status === 'success' ? 'completed' : result.status === 'failed' ? 'failed' : 'pending';
        database.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), row.id);
        results.push({ id: row.id, ok: true, status });
      } catch { results.push({ id: row.id, ok: false, message: 'Provider operation unavailable; order unchanged' }); }
    }
    log('order.sync', String(rows.length));
    return { ok: results.every((result) => result.ok), checked: results.length, results };
  }
  if (orderMatch && ['PUT', 'PATCH'].includes(method)) {
    requireValue(['completed', 'failed', 'needs-review', 'cancelled'].includes(body.status), 'Invalid order status');
    const row = database.prepare('SELECT * FROM orders WHERE id=?').get(orderMatch[1]);
    requireValue(row, 'Order not found', 404);
    const details = { ...JSON.parse(row.details_json), note: text(body.note || '', 1000) };
    database.prepare('UPDATE orders SET status=?,details_json=?,updated_at=? WHERE id=?').run(body.status, JSON.stringify(details), new Date().toISOString(), row.id);
    log('order.reconcile', row.domain);
    return { ok: true };
  }
  if (path === '/api/v1/lookup' && method === 'GET') {
    const name = dnsName(query.get('domain') || query.get('name'));
    const type = (query.get('type') || 'A').toUpperCase();
    requireValue(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV'].includes(type), 'Invalid DNS query type');
    const resolver = context.resolver || new Resolver({ timeout: 2500, tries: 1 });
    if (query.get('server')) { requireValue(publicAddress(query.get('server')), 'DNS server must be a public IP address'); resolver.setServers([query.get('server')]); }
    try { return { name, type, records: await resolver.resolve(name, type) }; }
    catch { throw new HttpError(502, 'DNS resolution failed or record was not found'); }
  }
  if (path === '/api/v1/contacts' && method === 'POST') {
    requireValue(can(user, 'domain:write'), 'Domain write permission required', 403);
    return (await adapterFor(database, context, body.connectionId).adapter.execute('contacts', { input: body.contact })).result;
  }
}
