import { randomUUID } from 'node:crypto';
import { requireValue } from './errors.js';
import { permissions } from './permissions.js';
import { validateManifest } from './manifests.js';
import { domainName, validateCredentials } from './providers.js';
import { encrypt } from './vault.js';
import { saveSetting, transaction } from './store.js';

export function importLegacy(database, key, snapshot) {
  for (const table of ['users', 'connections', 'domains', 'orders', 'payments']) requireValue(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count === 0, 'Migration requires an empty destination database');
  const users = snapshot.users || [];
  requireValue(Array.isArray(users) && users.length > 0 && users.length <= 10000, 'Legacy users are required');
  const config = snapshot.config || {};
  const connections = [...(config.connections || [])];
  if (config.spaceship?.apiKey && !connections.some((item) => item.provider === 'spaceship')) connections.push({ id: 'legacy-spaceship', provider: 'spaceship', credentials: config.spaceship, enabled: true });
  if (config.cloudflare?.apiToken && !connections.some((item) => item.provider === 'cloudflare')) connections.push({ id: 'legacy-cloudflare', provider: 'cloudflare', credentials: config.cloudflare, enabled: true });
  requireValue(Array.isArray(connections) && connections.length <= 1000, 'Invalid connections');
  const summary = { users: 0, connections: 0, domains: 0, payments: 0, orders: 0, roles: 0, channels: 0 };
  transaction(database, () => {
    const roleIds = new Map();
    for (const role of snapshot.roles || []) {
      const roleId = randomUUID();
      const granted = (role.permissions || []).filter((permission) => permissions.includes(permission));
      database.prepare('INSERT INTO roles VALUES(?,?,?)').run(roleId, String(role.name || role.code || role.id), JSON.stringify(granted));
      roleIds.set(role.id, roleId);
      roleIds.set(role.code, roleId);
      summary.roles += 1;
    }
    for (const account of users) {
      requireValue(typeof account.username === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(account.username), 'Invalid legacy username');
      requireValue(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(account.passwordHash || ''), 'Unsupported password hash; migration stopped');
      const codes = account.roleCodes || account.roles || [];
      requireValue(Array.isArray(codes), 'Invalid legacy roles');
      const admin = codes.includes('super') || codes.includes('admin') || codes.includes('super_admin');
      const id = randomUUID();
      const active = !['disabled', 'inactive'].includes(account.status) && account.status !== 0 && account.status !== false;
      database.prepare('INSERT INTO users(id,username,password_hash,status,profile_json,role,base_permissions_json) VALUES(?,?,?,?,?,?,?)').run(id, account.username, account.passwordHash, active ? 'active' : 'disabled', JSON.stringify({ realName: account.realName || '', email: account.email || '', note: account.note || '', createdAt: account.createdAt || '', lastLoginAt: account.lastLoginAt || '' }), admin ? 'admin' : 'viewer', JSON.stringify([]));
      for (const code of codes) if (roleIds.has(code)) database.prepare('INSERT OR IGNORE INTO user_roles VALUES(?,?)').run(id, roleIds.get(code));
      summary.users += 1;
    }
    requireValue(database.prepare("SELECT count(*) AS count FROM users WHERE role='admin' AND status='active'").get().count > 0, 'Migration must retain an active administrator');
    const custom = new Map();
    for (const candidate of snapshot.providers || []) {
      if (['porkbun', 'spaceship', 'cloudflare'].includes(candidate.id)) continue;
      const manifest = validateManifest(candidate);
      custom.set(manifest.id, manifest);
      database.prepare('INSERT INTO provider_manifests VALUES(?,?)').run(manifest.id, JSON.stringify(manifest));
    }
    const connectionIds = new Map();
    for (const bound of connections) {
      const id = randomUUID();
      const provider = bound.provider;
      const raw = bound.credentials || {};
      const incoming = { ...raw, ...(provider === 'porkbun' ? { secretKey: raw.secretKey || raw.apiSecret } : provider === 'cloudflare' ? { token: raw.token || raw.apiToken, accountId: raw.accountId || raw.accountID } : {}) };
      const builtin = ['porkbun', 'cloudflare', 'spaceship'].includes(provider);
      requireValue(builtin || custom.has(provider) || ['godaddy', 'namecheap'].includes(provider), 'Missing custom provider manifest');
      const credentials = builtin ? validateCredentials(provider, incoming) : incoming;
      database.prepare('INSERT INTO connections(id,name,provider,credentials,created_at,enabled,is_default,provider_ref) VALUES(?,?,?,?,?,?,?,?)').run(id, String(bound.name || provider), builtin ? provider : 'porkbun', encrypt(key, credentials), bound.createdAt || new Date().toISOString(), Number(bound.enabled !== false), Number(bound.isDefault === true && bound.enabled !== false), builtin ? '' : provider);
      if (Array.isArray(bound.roles) && bound.roles.some((role) => ['registrar', 'dns'].includes(role))) database.prepare('UPDATE connections SET roles_json=? WHERE id=?').run(JSON.stringify(bound.roles.filter((role) => ['registrar', 'dns'].includes(role))), id);
      connectionIds.set(bound.id, id);
      summary.connections += 1;
    }
    for (const domain of snapshot.domains || []) {
      const name = domainName(domain.name || domain.domain);
      database.prepare('INSERT INTO domains(id,name,connection_id,remote_id,expires_at,auto_renew,notes,metadata_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING').run(randomUUID(), name, connectionIds.get(domain.connectionId) || null, domain.remoteId || domain.zoneId || '', domain.expirationDate || domain.expiresAt || domain.expireDate || '', Number(domain.autoRenew === true), String(domain.notes || ''), JSON.stringify({ status: domain.status || domain.lifecycleStatus || '', registrationDate: domain.registrationDate || '', nameservers: domain.nameservers || null, isPremium: domain.isPremium === true }));
      summary.domains += 1;
    }
    const paymentIds = new Map();
    for (const payment of snapshot.payments || []) {
      const type = payment.type || 'other';
      const account = String(payment.account || payment.last4 || '');
      const details = { name: payment.name || type, type, last4: type === 'card' ? account.replace(/\D/g, '').slice(-4) : account, holder: payment.holder || '', expiry: payment.expiry || '', notes: payment.note || '' };
      const id = randomUUID();
      database.prepare('INSERT INTO payments VALUES(?,?,?,?,?)').run(id, details.name, type, JSON.stringify(details), Number(payment.isDefault === true));
      paymentIds.set(payment.id, id);
      summary.payments += 1;
    }
    for (const order of snapshot.orders || []) {
      database.prepare('INSERT INTO orders(id,connection_id,domain,kind,status,operation_id,details_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(), connectionIds.get(order.connectionId) || null, domainName(order.domain), order.kind || order.action || order.type || 'legacy', order.status === 'succeeded' ? 'completed' : order.status === 'submitted' ? 'pending' : order.status || 'needs-review', order.operationId || '', JSON.stringify({ price: order.price || null, amount: order.amount ?? null, currency: order.currency || '', years: order.years || 1, migrated: true, legacyId: order.id || '', paymentMethodId: paymentIds.get(order.paymentMethodId || order.paymentId) || null, paymentName: order.paymentName || '', note: order.note || '', provider: order.provider || '', officialStatus: order.officialStatus || '' }), order.createdAt || new Date().toISOString(), order.updatedAt || order.createdAt || new Date().toISOString());
      summary.orders += 1;
    }
    saveSetting(database, 'contacts', config.contacts || {});
    saveSetting(database, 'safety', { billingEnabled: false, confirmWrites: true });
    const notifications = snapshot.notifications || {};
    saveSetting(database, 'notifications', { enabled: false, expiryDays: notifications.rules?.expiryDays || [30, 14, 7, 3, 1], notifyOnRenew: notifications.rules?.notifyOnRenew === true });
    for (const channel of notifications.channels || []) {
      const fields = Object.fromEntries(Object.entries(channel.config || {}).filter(([name]) => name !== 'secure').map(([name, value]) => [name, String(value)]));
      const selected = !Array.isArray(notifications.channelIds) || notifications.channelIds.length === 0 || notifications.channelIds.includes(channel.id);
      database.prepare('INSERT INTO notification_channels VALUES(?,?,?,?,?)').run(randomUUID(), channel.name || channel.type, channel.type, Number(channel.enabled !== false && selected), encrypt(key, fields));
      summary.channels += 1;
    }
    saveSetting(database, 'notifications-last', notifications.lastResult || {});
    for (const [legacyKey, timestamp] of Object.entries(snapshot.notificationState?.sent || {})) {
      const [name, threshold, expiry] = legacyKey.split('|');
      if (name && /^\d+$/.test(threshold || '') && /^\d{4}-\d{2}-\d{2}$/.test(expiry || '') && Number.isFinite(Number(timestamp)) && Number(timestamp) > 0) database.prepare('INSERT OR IGNORE INTO notification_sent VALUES(?,?)').run(`legacy|${name}|${expiry}|${threshold}`, new Date(Number(timestamp)).toISOString());
    }
    for (const entry of (snapshot.notificationState?.log || []).slice(-500)) database.prepare('INSERT INTO notification_log(channel_id,subject,ok,message,created_at) VALUES(?,?,?,?,?)').run(String(entry.channel || 'legacy'), String(entry.domain || entry.kind || 'legacy').slice(0, 200), Number(entry.ok === true), entry.ok ? 'Legacy delivery succeeded' : 'Legacy delivery failed', entry.ts || entry.createdAt || new Date().toISOString());
    for (const entry of (snapshot.audit || []).slice(-10000)) database.prepare('INSERT INTO audit(username,action,target,created_at) VALUES(?,?,?,?)').run(String(entry.username || entry.actor || 'legacy'), String(entry.action || 'legacy'), String(entry.target || '').slice(0, 300), entry.ts || entry.createdAt || new Date().toISOString());
  });
  return summary;
}
