import { resource } from './resources.js';
import { providerList } from './registry.js';
import { authorize, can, permissions } from './permissions.js';
import { setting } from './store.js';
import { requireValue } from './errors.js';
import { adapterFor } from './registry.js';

const collection = (items) => ({ items, total: items.length });
const roleCode = (id) => id === 'admin' ? 'super' : id;
const orderStatus = (status) => ({ completed: 'succeeded', pending: 'submitted', submitting: 'submitted' }[status] || status);

function availabilityResult(value, provider) {
  const result = value?.result ?? value?.available ?? value;
  if (typeof result === 'string') return result;
  if (typeof result === 'boolean') return result ? 'available' : 'taken';
  if (provider === 'cloudflare') {
    const entry = value?.domains?.[0];
    if (entry?.registrable === true || entry?.available === true || entry?.status === 'available') return 'available';
    if (entry?.available === false || entry?.registrable === false && entry.reason === 'domain_unavailable') return 'taken';
    if (entry?.reason?.startsWith('extension_not_supported') || entry?.reason === 'extension_disallows_registration') return 'tldNotSupported';
    return 'unexpectedError';
  }
  if (provider === 'porkbun') return String(value?.avail) === 'yes' || value?.avail === true ? 'available' : String(value?.avail) === 'no' || value?.avail === false ? 'taken' : 'unexpectedError';
  return 'unexpectedError';
}

function capabilities(provider) {
  const values = new Set(provider?.capabilities || []);
  return Object.fromEntries(['register', 'renew', 'transfer', 'authCode', 'nameservers', 'autorenew', 'transferLock', 'dns', 'payments', 'invoices'].map((key) => [key, values.has(key) || ({ renew: 'renew', autorenew: 'setAutoRenew', nameservers: 'setNameservers', dns: 'listDns', authCode: 'getAuthCode', transferLock: 'setTransferLock' }[key] && values.has({ autorenew: 'setAutoRenew', nameservers: 'setNameservers', dns: 'listDns', authCode: 'getAuthCode', transferLock: 'setTransferLock' }[key])) || false]).concat([['registrar', true], ['requiresContact', provider?.id === 'spaceship']]));
}

function providerView(provider) {
  const can = capabilities(provider);
  return { ...provider, vendor: provider.name, roles: can.dns ? ['registrar', 'dns'] : ['registrar'], canHostDns: can.dns, capabilities: can, fields: provider.fields.map((field) => typeof field === 'string' ? { key: field, label: field, required: true, secret: field !== 'accountId' } : field), setup: provider.setup.map((step) => typeof step === 'string' ? { title: step } : step) };
}

function domainView(row, providers) {
  const metadata = JSON.parse(row.metadata_json || '{}');
  const can = capabilities(providers.find((provider) => provider.id === row.provider));
  if (row.provider === 'cloudflare' && !metadata.registrar) { can.autorenew = false; can.transferLock = false; }
  const expirationDate = row.expires_at || '';
  return { id: row.id, name: row.name, unicodeName: row.name, provider: row.provider || 'manual', connectionId: row.connection_id, connectionName: row.connection_name || '', autoRenew: Boolean(row.auto_renew), registrationDate: metadata.registrationDate || metadata.createDate || '', expirationDate, daysLeft: expirationDate ? Math.ceil((Date.parse(expirationDate) - Date.now()) / 86400000) : null, lifecycleStatus: metadata.status || '', nameservers: metadata.nameservers?.hosts || metadata.nameservers || [], locked: metadata.locked === true, privacy: metadata.privacyProtection?.level || null, isPremium: Boolean(metadata.isPremium), can, zoneId: row.connection_id && row.remote_id ? `${row.connection_id}:${row.remote_id}` : null, zoneConnectionId: row.connection_id, notes: row.notes || '' };
}

export async function vbenResource(database, context) {
  let { path, method, body, query } = context;
  const invoke = async (target, verb = 'GET', input = {}, params = query) => {
    authorize(database, context.user, target, verb);
    return resource(database, { ...context, path: target, method: verb, body: input, query: params });
  };
  const providers = providerList(database);
  const connectionViews = async () => (await invoke('/api/v1/connections')).map((bound) => {
    const provider = providerView(providers.find((item) => item.id === bound.provider));
    return { ...bound, providerName: provider.name, capabilities: provider.capabilities, roles: bound.roles || provider.roles, canHostDns: provider.canHostDns, credentials: {} };
  });
  if (path === '/api/v1/connections' && method === 'GET') return collection(await connectionViews());
  if (path === '/api/v1/providers' && method === 'GET') return { items: providers.map(providerView), paymentTypes: await invoke('/api/v1/payment-types').catch(() => []) };
  if (path === '/api/v1/providers/presets' && method === 'GET') return collection(await invoke(path));
  if (path === '/api/v1/providers/custom/validate' && method === 'POST') {
    const result = await invoke(path, method, body);
    return { ...result, provider: { id: result.manifest.id, name: result.manifest.name }, ops: Object.keys(result.manifest.ops) };
  }
  if (path === '/api/v1/domains' && method === 'GET') return { ...collection((await invoke(path)).map((row) => domainView(row, providers))), errors: [] };
  if (path === '/api/v1/overview' && method === 'GET') {
    const rows = (await invoke('/api/v1/domains')).map((row) => domainView(row, providers));
    const stats = await invoke(path);
    const connections = database.prepare('SELECT provider,provider_ref FROM connections WHERE enabled=1').all();
    const result = { at: new Date().toISOString(), domains: { ...collection(rows), errors: [] }, expiring: rows.filter((row) => row.daysLeft !== null && row.daysLeft <= 45), stats: { registrars: connections.length, dnsProviders: connections.filter((row) => capabilities(providers.find((provider) => provider.id === (row.provider_ref || row.provider))).dns).length, billingEnabled: setting(database, 'safety').billingEnabled } };
    if (can(context.user, 'dns:read')) {
      const zones = await invoke('/api/v1/dns/zones');
      result.zones = collection(zones.items.map((zone) => ({ ...zone, status: zone.status || 'active' })));
      result.domains.errors = zones.notes;
    }
    if (can(context.user, 'payment:read')) { result.orders = (await invoke('/api/v1/orders')).map((order) => ({ ...order, ...order.details.price, createdAt: order.created_at })); result.spendThisYear = stats.spendThisYear; }
    if (can(context.user, 'audit:read')) result.audit = (await invoke('/api/v1/audit')).map((row) => ({ ...row, ts: row.created_at, status: 'ok', summary: row.target }));
    return result;
  }
  const domain = /^\/api\/v1\/domains\/([^/]+)$/.exec(path);
  if (domain && method === 'GET') {
    const row = await invoke(path);
    const bound = database.prepare('SELECT name,COALESCE(NULLIF(provider_ref,\'\'),provider) AS provider FROM connections WHERE id=?').get(row.connection_id);
    const info = domainView({ ...row, provider: bound?.provider, connection_name: bound?.name }, providers);
    const remote = row.connection_id && (bound?.provider !== 'cloudflare' || JSON.parse(row.metadata_json || '{}').registrar) ? await invoke(`${path}/details`) : {};
    const zone = can(context.user, 'dns:read') ? (await invoke('/api/v1/dns/zones')).items.find((item) => item.name === row.name && item.provider === 'cloudflare') || null : null;
    return { info: { ...info, ...remote, id: info.id, notes: info.notes, nameservers: remote.nameservers?.hosts || (Array.isArray(remote.nameservers) ? remote.nameservers : info.nameservers), name: info.name, connectionId: info.connectionId, can: info.can, daysLeft: info.daysLeft }, zone };
  }
  if (['/api/v1/availability', '/api/v1/transfer/quotes'].includes(path) && method === 'GET') {
    const result = await invoke(path);
    result.quotes = result.quotes.map((quote) => ({ ...quote, capabilities: { ...capabilities(providers.find((provider) => provider.id === quote.provider)), ...quote.supports }, requiresContact: quote.provider === 'spaceship', price: quote.prices?.transfer, availability: { result: availabilityResult(quote.availability, quote.provider), reason: quote.availability?.reason || quote.availability?.domains?.[0]?.reason || '' } }));
    const selected = result.quotes.find((quote) => !quote.error);
    return { ...result, pricing: { prices: Object.fromEntries(['register', 'renew', 'transfer'].map((kind) => [kind, selected?.prices?.[kind] ? [{ priceInDefaultCurrency: { finalPrice: selected.prices[kind] } }] : []])) } };
  }
  if (path === '/api/v1/accounts' && method === 'GET') {
    const keyword = (query.get('keyword') || '').toLowerCase();
    return collection((await invoke(path)).filter((account) => `${account.username} ${account.realName} ${account.email}`.toLowerCase().includes(keyword)).map((account) => ({ ...account, roleCodes: [...(account.role === 'admin' ? ['super'] : account.inheritViewer ? ['viewer'] : []), ...database.prepare('SELECT role_id FROM user_roles WHERE user_id=?').all(account.id).map((row) => row.role_id)], roleNames: [account.role] })));
  }
  const account = /^\/api\/v1\/accounts(?:\/([a-zA-Z0-9-]+))?$/.exec(path);
  if (account && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const previous = account[1] ? database.prepare('SELECT * FROM users WHERE id=?').get(account[1]) : null;
    requireValue(!account[1] || previous, 'Account not found', 404);
    const role = body.roleCodes ? body.roleCodes.includes('super') || body.roleCodes.includes('admin') ? 'admin' : 'viewer' : previous?.role || 'viewer';
    const custom = body.roleCodes?.filter((code) => !['super', 'admin', 'viewer'].includes(code));
    requireValue(!custom?.length || context.user.role === 'admin', 'Only administrators can assign roles', 403);
    for (const id of custom || []) requireValue(database.prepare('SELECT id FROM roles WHERE id=?').get(id), 'Unknown role');
    const input = { ...JSON.parse(previous?.profile_json || '{}'), username: previous?.username, status: previous?.status || 'active', ...body, role };
    const result = await invoke(path, method, input);
    const id = account[1] || database.prepare('SELECT id FROM users WHERE username=?').get(input.username).id;
    if (custom && context.user.role === 'admin') await invoke(`/api/v1/accounts/${id}/roles`, 'PUT', { roleIds: custom, inheritViewer: body.roleCodes.includes('viewer') });
    return { ...result, username: input.username, realName: input.realName, email: input.email };
  }
  if (path === '/api/v1/roles' && method === 'GET') return collection((await invoke(path)).map((role) => ({ ...role, code: roleCode(role.id), description: '', userCount: database.prepare('SELECT count(*) AS count FROM user_roles WHERE role_id=?').get(role.id).count })));
  if (path === '/api/v1/permissions' && method === 'GET') return { all: permissions, groups: [...new Set(permissions.map((permission) => permission.split(':')[0]))].map((name) => ({ name, key: name, items: permissions.filter((permission) => permission.startsWith(`${name}:`)).map((code) => ({ code, name: code, label: code })) })) };
  if (path === '/api/v1/auth/change-password' && method === 'POST') body = { ...body, currentPassword: body.currentPassword || body.oldPassword, password: body.password || body.newPassword };
  if (path === '/api/v1/payments' && method === 'GET') {
    const items = (await invoke(path)).map((payment) => ({ ...payment, account: payment.last4, note: payment.notes, editable: true, status: payment.status || 'active' }));
    const cache = setting(database, 'synced-payments');
    const synced = (cache.items || []).filter((item) => database.prepare('SELECT id FROM connections WHERE id=? AND enabled=1').get(item.connectionId)).map((item) => ({ ...item, account: item.last4, status: 'active' }));
    return { items: [...items, ...synced], manual: items, synced, notes: cache.notes || [], syncedAt: cache.syncedAt, defaultName: items.find((item) => item.isDefault)?.name || null };
  }
  if (/^\/api\/v1\/payments(?:\/[^/]+)?$/.test(path) && ['POST', 'PUT'].includes(method)) body = { ...body, notes: body.notes ?? body.note, last4: body.last4 ?? body.account };
  if (path === '/api/v1/payment-types' && method === 'GET') return (await invoke(path)).map((type) => ({ id: type, type, label: type, name: type }));
  if (path === '/api/v1/orders' && method === 'GET') return collection((await invoke(path)).filter((order) => !query.get('domain') || order.domain.includes(query.get('domain'))).map((order) => ({ ...order, ...order.details, ...order.details.price, status: orderStatus(order.status), registrar: database.prepare('SELECT name FROM connections WHERE id=?').get(order.connectionId)?.name || '', paymentName: database.prepare('SELECT name FROM payments WHERE id=?').get(order.details.paymentMethodId || '')?.name || '', action: order.kind, createdAt: order.created_at, updatedAt: order.updated_at })));
  if (/^\/api\/v1\/orders\/[^/]+$/.test(path) && ['PUT', 'PATCH'].includes(method)) body = { ...body, status: body.status === 'succeeded' ? 'completed' : body.status };
  if (path === '/api/v1/audit' && method === 'GET') return collection((await invoke(path)).map((row) => ({ ...row, ts: row.created_at, status: 'ok', summary: row.target })));
  if (path === '/api/v1/notifications' && method === 'GET') {
    const result = await invoke(path);
    return { ...result, rules: { expiryDays: result.expiryDays, notifyOnRenew: result.notifyOnRenew }, lastCheckAt: result.lastResult?.checkedAt, channelTypes: result.channelTypes.map((type) => ({ type, name: type, label: type, fields: result.channelFields[type].map((key) => ({ key, label: key, secret: ['pass', 'botToken', 'deviceKey', 'secret', 'headers', 'url', 'webhook'].includes(key), default: type === 'email' && key === 'port' ? '465' : '' })) })) };
  }
  if (path === '/api/v1/notifications/log' && method === 'GET') return collection((await invoke(path)).map((row) => ({ ...row, ts: row.created_at, channelId: row.channel_id, title: row.subject })));
  if (path === '/api/v1/notifications/test' && method === 'POST') {
    const results = await invoke(path, method, body);
    return { ...collection(results), results, ok: results.length > 0 && results.every((result) => result.ok), message: results.every((result) => result.ok) ? '发送成功' : '发送失败，请核对渠道配置' };
  }
  if (path === '/api/v1/system/status' && method === 'GET') {
    const result = await invoke(path);
    return { ...result, app: { version: result.version, node: result.runtime, platform: process.platform, uptimeSeconds: result.uptime, mode: context.demo ? 'demo' : 'production' }, paths: { dataDir: context.dataDirectory }, counts: Object.fromEntries(['users', 'roles', 'connections', 'payments', 'orders'].map((table) => [table, database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count])), safety: setting(database, 'safety'), notifications: { ...setting(database, 'notifications'), channels: database.prepare('SELECT count(*) AS count FROM notification_channels').get().count }, connections: await connectionViews() };
  }
  if (path === '/api/v1/settings/test' && method === 'POST') {
    const result = await invoke(path, method, body);
    return { ...result, items: Object.entries(result).map(([id, outcome]) => ({ id, ...outcome })) };
  }
  const dnsEdit = /^\/api\/v1\/dns\/zones\/([^/]+)\/records\/([a-zA-Z0-9_-]+)$/.exec(path);
  if (dnsEdit && method === 'PATCH') {
    const connectionId = decodeURIComponent(dnsEdit[1]).split(':')[0];
    if (adapterFor(database, context, connectionId).adapter.provider === 'spaceship') {
      await invoke(path.slice(0, path.lastIndexOf('/')), 'POST', body);
      try { await invoke(path, 'DELETE', {}); }
      catch { requireValue(false, 'Replacement record created but old record removal failed. Refresh DNS records before retrying.', 502); }
      return { ok: true, replaced: true };
    }
  }
  const result = await invoke(path, method, body);
  if (/^\/api\/v1\/orders(?:\/[^/]+)?\/sync$/.test(path) && method === 'POST') return { ...result, updated: result.results.filter((item) => item.ok).map((item) => ({ ...item, status: orderStatus(item.status) })), notes: result.results.filter((item) => !item.ok).map((item) => ({ ...item, domain: item.id })) };
  if (['/api/v1/payments/capabilities', '/api/v1/payments/probe'].includes(path)) return { ...result, connections: database.prepare('SELECT id,name,COALESCE(NULLIF(provider_ref,\'\'),provider) AS provider,enabled FROM connections').all(), providers: result.providers.map((item) => ({ ...item, id: item.provider, name: providers.find((provider) => provider.id === item.provider)?.name || item.provider, notes: { evidence: [item.note] } })), note: '仅使用已公开的官方接口；未开放的账单能力不会试探其他端点' };
  if (path === '/api/v1/payments/verify') return { ...result, name: result.payment.name, message: result.note };
  if (path === '/api/v1/accounts/balances') return { ...result, items: result.items.map((item) => ({ ...item, balance: { amount: item.amount, currency: item.currency, display: item.display }, payments: false, invoices: true })) };
  if (/^\/api\/v1\/dns\/zones\/[^/]+\/records$/.test(path) && method === 'GET') return collection(result.map((record) => ({ ...record, raw: record })));
  if (path === '/api/v1/dns/zones' && method === 'GET') return { ...result, total: result.items.length };
  if (path === '/api/v1/lookup' && method === 'GET') return { ...result, answer: result.records, resolver: query.get('server') || 'system' };
  if (path === '/api/v1/invoices' && method === 'GET') return { ...result, items: result.items.map((item) => ({ ...item, invoiceId: item.id, hostedInvoiceUrl: item.url })) };
  if (path === '/api/v1/system/update' && method === 'GET') return { ...result, hasUpdate: Boolean(result.available), installSupported: Boolean(result.installSupported), current: { version: result.current, runtime: process.version, platform: process.platform, execPath: process.execPath, managed: result.installSupported ? 'systemd' : null }, configured: true, settings: { githubRepo: 'logdns/DomainDeck', feed: '' } };
  if (path === '/api/v1/system/update/check' && method === 'POST') return { ...result, hasUpdate: result.available, installSupported: Boolean(result.installSupported), latest: result.latest || (result.available ? { version: result.version, source: 'github' } : null), checkedAt: result.checkedAt || new Date().toISOString() };
  return result;
}
