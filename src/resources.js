import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './accounts.js';
import { removeInitialPassword } from './initialize.js';
import { domainName } from './providers.js';
import { HttpError } from './errors.js';
import { systemResource } from './system.js';
import { commerceResource } from './commerce.js';
import { financeResource } from './finance.js';
import { adapterFor } from './registry.js';
import { can } from './permissions.js';
import { notificationResource } from './notifications.js';
import { dnsResource } from './dns.js';

export { HttpError } from './errors.js';

function text(value, limit = 2000) {
  if (typeof value !== 'string' || value.length > limit) throw new HttpError(400, 'Invalid text field');
  return value.trim();
}

function accountInput(body) {
  if (typeof body.username !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(body.username) || !['admin', 'viewer'].includes(body.role) || !['active', 'disabled'].includes(body.status)) throw new HttpError(400, 'Invalid account fields');
}

function profileInput(body) {
  return JSON.stringify({ realName: text(body.realName || '', 100), email: text(body.email || '', 200), note: text(body.note || '', 1000) });
}

export async function resource(database, context) {
  const { method, path, user, body, key, dataDirectory, transport, updater } = context;
  for (const handler of [systemResource, commerceResource, financeResource, notificationResource, dnsResource]) {
    const result = await handler(database, context);
    if (result !== undefined) return result;
  }
  const publicConnections = () => database.prepare('SELECT id,name,provider,created_at FROM connections ORDER BY name').all();
  const domains = () => database.prepare(`SELECT domains.*, COALESCE(NULLIF(connections.provider_ref,''), connections.provider) AS provider, connections.name AS connection_name FROM domains LEFT JOIN connections ON connections.id = domains.connection_id ORDER BY domains.name LIMIT 20000`).all();
  const log = (action, target = '') => database.prepare('INSERT INTO audit(username, action, target, created_at) VALUES(?,?,?,?)').run(user.username, action, target, new Date().toISOString());
  if (path === '/api/v1/overview' && method === 'GET') {
    const assets = domains();
    const now = Date.now();
    const result = { domains: assets.length, connections: publicConnections().length, expiring: assets.filter((item) => { const expiry = Date.parse(item.expires_at); return expiry >= now && expiry < now + 30 * 86400000; }).length, expired: assets.filter((item) => Date.parse(item.expires_at) < now).length, autoRenew: assets.filter((item) => item.auto_renew).length, version: context.version };
    if (can(user, 'payment:read')) {
      result.orders = database.prepare('SELECT count(*) AS count FROM orders').get().count;
      result.spendThisYear = database.prepare("SELECT details_json FROM orders WHERE status='completed' AND created_at>=?").all(`${new Date().getUTCFullYear()}-01-01`).reduce((totals, order) => {
        const details = JSON.parse(order.details_json);
        const amount = Number(details.price?.amount ?? details.amount);
        const currency = details.price?.currency || details.currency;
        if (currency && Number.isFinite(amount)) totals[currency] = (totals[currency] || 0) + amount;
        return totals;
      }, {});
    }
    if (can(user, 'audit:read')) result.recentActivity = database.prepare('SELECT username,action,target,created_at FROM audit ORDER BY id DESC LIMIT 8').all();
    return result;
  }
  if (path === '/api/v1/domains' && method === 'GET') return domains();
  if (path === '/api/v1/connections' && method === 'GET') return publicConnections();
  if (path === '/api/v1/audit' && method === 'GET') {
    if (!can(user, 'audit:read')) throw new HttpError(403, 'Audit permission required');
    return database.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all();
  }
  if (path === '/api/v1/accounts' && method === 'GET') {
    if (!can(user, 'account:read')) throw new HttpError(403, 'Account permission required');
    return database.prepare('SELECT id,username,role,status,profile_json FROM users ORDER BY username').all().map(({ profile_json, ...account }) => ({ ...account, ...JSON.parse(profile_json) }));
  }
  if (path === '/api/v1/accounts' && method === 'POST') {
    accountInput(body);
    const passwordHash = await hashPassword(body.password);
    database.prepare('INSERT INTO users(id,username,password_hash,status,profile_json,role) VALUES(?,?,?,?,?,?)').run(randomUUID(), body.username, passwordHash, body.status, profileInput(body), body.role);
    log('account.create', body.username);
    return { ok: true };
  }
  const accountMatch = /^\/api\/v1\/accounts\/([a-zA-Z0-9-]+)$/.exec(path);
  if (accountMatch && ['PATCH', 'PUT'].includes(method)) {
    accountInput(body);
    const target = database.prepare('SELECT * FROM users WHERE id = ?').get(accountMatch[1]);
    if (!target) throw new HttpError(404, 'Account not found');
    const previousHash = target.password_hash;
    if (target.id === user.id && !(await verifyPassword(body.currentPassword, previousHash))) throw new HttpError(400, 'Current password required');
    const passwordHash = body.password ? await hashPassword(body.password) : previousHash;
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database.prepare('SELECT * FROM users WHERE id=?').get(target.id);
      const caller = database.prepare("SELECT * FROM users WHERE id=? AND status='active'").get(user.id);
      if (!caller || !current || current.password_hash !== previousHash) throw new HttpError(409, 'Account changed; sign in and retry');
      if (target.role === 'admin' && target.status === 'active' && (body.role !== 'admin' || body.status !== 'active') && database.prepare("SELECT count(*) AS count FROM users WHERE role='admin' AND status='active'").get().count <= 1) throw new HttpError(400, 'The last active administrator must be retained');
      database.prepare('UPDATE users SET username=?, role=?, status=?, password_hash=?,profile_json=? WHERE id=?').run(body.username, body.role, body.status, passwordHash, profileInput({ ...JSON.parse(target.profile_json), ...body }), target.id);
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      log('account.update', body.username);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    if (target.id === user.id && body.password) removeInitialPassword(dataDirectory);
    return { ok: true, loginRequired: target.id === user.id };
  }
  const connectionMatch = /^\/api\/v1\/connections\/([a-zA-Z0-9-]+)(?:\/(sync|test))?$/.exec(path);
  if (connectionMatch) {
    const connection = database.prepare('SELECT * FROM connections WHERE id=?').get(connectionMatch[1]);
    if (!connection) throw new HttpError(404, 'Connection not found');
    if (method === 'DELETE' && !connectionMatch[2]) {
      database.prepare('DELETE FROM connections WHERE id=?').run(connection.id);
      log('connection.delete', connection.name);
      return { ok: true };
    }
    if (method === 'POST' && connectionMatch[2]) {
      const { adapter: provider } = adapterFor(database, context, connection.id);
      let assets;
      try { assets = await provider.domains(); } catch { throw new HttpError(502, 'Provider request failed; check credentials, API access and permissions'); }
      if (connectionMatch[2] === 'test') return { ok: true, domains: assets.length };
      database.exec('BEGIN IMMEDIATE');
      try {
        const insert = database.prepare(`INSERT INTO domains(id,name,connection_id,remote_id,expires_at,auto_renew) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET connection_id=excluded.connection_id,remote_id=excluded.remote_id,expires_at=CASE WHEN excluded.expires_at='' THEN domains.expires_at ELSE excluded.expires_at END, auto_renew=excluded.auto_renew WHERE domains.connection_id IS NULL OR domains.connection_id=excluded.connection_id`);
        for (const item of assets) insert.run(randomUUID(), item.name, connection.id, item.remoteId, item.expiresAt, Number(item.autoRenew));
        log('connection.sync', connection.name);
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
      return { ok: true, domains: assets.length };
    }
  }
  if (path === '/api/v1/domains' && method === 'POST') {
    const name = domainName(body.name);
    const expiresAt = text(body.expiresAt || '', 50);
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new HttpError(400, 'Invalid expiry date');
    const id = randomUUID();
    database.prepare('INSERT INTO domains(id,name,expires_at,notes) VALUES(?,?,?,?)').run(id, name, expiresAt, text(body.notes || ''));
    log('domain.create', name);
    return { id };
  }
  if (path === '/api/v1/domains/import' && method === 'POST') {
    if (!Array.isArray(body.domains) || body.domains.length > 5000) throw new HttpError(400, 'Provide at most 5000 domain records');
    const entries = body.domains.map((item) => {
      const expires = text(item.expires_at || item.expiresAt || item.expireDate || '', 50);
      if (expires && !Number.isFinite(Date.parse(expires))) throw new HttpError(400, 'Invalid expiry date');
      return { name: domainName(item.name || item.domain), expires, notes: text(item.notes || '') };
    });
    database.exec('BEGIN IMMEDIATE');
    try {
      const insert = database.prepare('INSERT INTO domains(id,name,expires_at,notes) VALUES(?,?,?,?) ON CONFLICT(name) DO NOTHING');
      for (const item of entries) insert.run(randomUUID(), item.name, item.expires, item.notes);
      log('domain.import', String(entries.length));
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    return { ok: true, processed: entries.length };
  }
  const domainMatch = /^\/api\/v1\/domains\/([a-zA-Z0-9-]+)(?:\/dns(?:\/([a-zA-Z0-9]+))?)?$/.exec(path);
  if (domainMatch) {
    const domain = database.prepare('SELECT * FROM domains WHERE id=?').get(domainMatch[1]);
    if (!domain) throw new HttpError(404, 'Domain not found');
    if (!path.includes('/dns') && method === 'GET') return domain;
    if (!path.includes('/dns') && ['PUT', 'PATCH'].includes(method)) {
      const expiry = text(body.expiresAt ?? domain.expires_at, 50);
      if (expiry && !Number.isFinite(Date.parse(expiry))) throw new HttpError(400, 'Invalid expiry date');
      database.prepare('UPDATE domains SET expires_at=?,notes=? WHERE id=?').run(expiry, text(body.notes ?? domain.notes), domain.id);
      log('domain.updateLocal', domain.name);
      return { ok: true };
    }
    if (!path.includes('/dns') && method === 'DELETE') {
      database.prepare('DELETE FROM domains WHERE id=?').run(domain.id);
      log('domain.removeLocal', domain.name);
      return { ok: true };
    }
    if (path.includes('/dns')) {
      const connection = database.prepare('SELECT * FROM connections WHERE id=?').get(domain.connection_id);
      if (!connection) throw new HttpError(400, 'Sync a provider connection to manage DNS');
      const { adapter: provider } = adapterFor(database, context, connection.id);
      try {
        if (method === 'GET') return await provider.records(domain);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && (method !== 'DELETE' || domainMatch[2])) {
          await provider.writeRecord(domain, body, domainMatch[2], method === 'DELETE');
          log(`dns.${method.toLowerCase()}`, domain.name);
          return { ok: true };
        }
      } catch (error) { if (error.status && error.status < 500) throw error; throw new HttpError(502, 'DNS request failed; verify record fields and provider permissions'); }
    }
  }
  if (['/api/v1/system/update', '/api/v1/update'].includes(path) && method === 'GET') return updater?.status?.() || { current: context.version, installSupported: false };
  if (['/api/v1/update/check', '/api/v1/system/update/check'].includes(path) && method === 'POST') {
    if (!updater) throw new HttpError(503, 'Updater unavailable');
    return updater.check();
  }
  if (['/api/v1/update/apply', '/api/v1/system/update/apply'].includes(path) && method === 'POST') {
    if (!updater) throw new HttpError(503, 'Updater unavailable');
    log('update.apply', context.version);
    return updater.apply();
  }
  throw new HttpError(404, 'Not found');
}
