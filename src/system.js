import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './accounts.js';
import { requireValue } from './errors.js';
import { permissions } from './permissions.js';
import { adapterFor, builtins, manifestFor, presets, providerList, validateCustomCredentials } from './registry.js';
import { validateManifest } from './manifests.js';
import { validateCredentials } from './providers.js';
import { audit, connection, connectionView, saveSetting, setting, text, transaction } from './store.js';
import { encrypt } from './vault.js';
import { removeInitialPassword } from './initialize.js';

export async function systemResource(database, context) {
  const { path, method, body, user, key } = context;
  const log = (action, target) => audit(database, user, action, target);
  if (path === '/api/v1/auth/codes' && method === 'GET') return user.permissions;
  if (path === '/api/v1/auth/change-password' && method === 'POST') {
    const account = database.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    requireValue(await verifyPassword(body.currentPassword, account.password_hash), 'Current password is incorrect');
    const hash = await hashPassword(body.password);
    transaction(database, () => {
      requireValue(database.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id)?.password_hash === account.password_hash, 'Account changed; retry', 409);
      database.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      log('account.password', user.username);
    });
    removeInitialPassword(context.dataDirectory);
    return { ok: true, loginRequired: true };
  }
  if (path === '/api/v1/providers' && method === 'GET') return providerList(database);
  if (path === '/api/v1/providers/presets' && method === 'GET') return presets;
  if (path === '/api/v1/providers/custom/validate' && method === 'POST') return { valid: true, manifest: validateManifest(body.manifest || body) };
  if (path === '/api/v1/providers/custom' && method === 'POST') {
    const manifest = validateManifest(body.manifest || body);
    const existing = database.prepare('SELECT count(*) AS count FROM connections WHERE provider_ref=?').get(manifest.id).count;
    requireValue(!existing, 'Remove dependent connections before replacing a manifest', 409);
    database.prepare('INSERT INTO provider_manifests VALUES(?,?) ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json').run(manifest.id, JSON.stringify(manifest));
    log('provider.save', manifest.id);
    return { id: manifest.id };
  }
  const manifestMatch = /^\/api\/v1\/providers\/custom\/([a-z][a-z0-9_-]+)$/.exec(path);
  if (manifestMatch) {
    if (method === 'GET') {
      const manifest = manifestFor(database, manifestMatch[1]);
      requireValue(manifest, 'Provider manifest not found', 404);
      return manifest;
    }
    if (method === 'DELETE') {
      requireValue(database.prepare('SELECT id FROM provider_manifests WHERE id=?').get(manifestMatch[1]), 'Built-in presets cannot be deleted', 409);
      requireValue(!database.prepare('SELECT count(*) AS count FROM connections WHERE provider_ref=?').get(manifestMatch[1]).count, 'Provider still has connections', 409);
      database.prepare('DELETE FROM provider_manifests WHERE id=?').run(manifestMatch[1]);
      log('provider.delete', manifestMatch[1]);
      return { ok: true };
    }
  }
  if (path === '/api/v1/connections' && method === 'GET') return database.prepare('SELECT * FROM connections ORDER BY is_default DESC,name').all().map(connectionView);
  const connectionMatch = /^\/api\/v1\/connections\/([a-zA-Z0-9_-]+)(?:\/(default|test))?$/.exec(path);
  if ((path === '/api/v1/connections' && method === 'POST') || (connectionMatch && !connectionMatch[2] && ['PUT', 'PATCH'].includes(method))) {
    const previous = connectionMatch ? connection(database, connectionMatch[1], key, true) : null;
    const provider = previous?.provider || body.provider;
    requireValue(!previous || !body.provider || body.provider === previous.provider, 'Provider cannot be changed on an existing connection');
    const name = text(body.name ?? previous?.name ?? '', 100);
    requireValue(name, 'Connection name required');
    const incoming = { ...(previous?.credentials || {}), ...(body.credentials || {}) };
    const credentials = builtins.some((item) => item.id === provider) ? validateCredentials(provider, incoming) : validateCustomCredentials(database, provider, incoming);
    const enabled = body.enabled === undefined ? previous?.enabled ?? 1 : Number(body.enabled === true);
    const isDefault = body.isDefault === undefined ? previous?.is_default ?? 0 : Number(body.isDefault === true);
    requireValue(enabled || !isDefault, 'A default connection must be enabled');
    const id = previous?.id || randomUUID();
    transaction(database, () => {
      if (isDefault) database.prepare('UPDATE connections SET is_default=0').run();
      if (previous) database.prepare('UPDATE connections SET name=?,credentials=?,enabled=?,is_default=? WHERE id=?').run(name, encrypt(key, credentials), enabled, isDefault, id);
      else database.prepare('INSERT INTO connections(id,name,provider,credentials,created_at,enabled,is_default,provider_ref) VALUES(?,?,?,?,?,?,?,?)').run(id, name, builtins.some((item) => item.id === provider) ? provider : 'porkbun', encrypt(key, credentials), new Date().toISOString(), enabled, isDefault, builtins.some((item) => item.id === provider) ? '' : provider);
      log(previous ? 'connection.update' : 'connection.create', name);
    });
    return { id };
  }
  if (connectionMatch?.[2] === 'default' && method === 'POST') {
    connection(database, connectionMatch[1], key);
    transaction(database, () => {
      database.prepare('UPDATE connections SET is_default=0').run();
      database.prepare('UPDATE connections SET is_default=1 WHERE id=?').run(connectionMatch[1]);
      log('connection.default', connectionMatch[1]);
    });
    return { ok: true };
  }
  if (connectionMatch?.[2] === 'test' && method === 'POST') {
    const { adapter } = adapterFor(database, context, connectionMatch[1]);
    await adapter.execute('test');
    return { ok: true, message: 'Connection verified' };
  }
  if (path === '/api/v1/settings' && method === 'GET') return { safety: setting(database, 'safety'), contacts: setting(database, 'contacts'), update: { githubRepo: 'logdns/DomainDeck', channel: context.version?.includes('beta') ? 'beta' : 'stable' } };
  if (path === '/api/v1/settings' && ['PUT', 'PATCH'].includes(method)) {
    transaction(database, () => {
      if (body.safety) saveSetting(database, 'safety', { billingEnabled: body.safety.billingEnabled === true, confirmWrites: true });
      if (body.contacts) saveSetting(database, 'contacts', Object.fromEntries(['registrant', 'admin', 'tech', 'billing'].map((field) => [field, text(body.contacts[field] || '', 200)])));
      log('settings.update', 'settings');
    });
    return { ok: true };
  }
  if (path === '/api/v1/settings/test' && method === 'POST') {
    const rows = database.prepare('SELECT id FROM connections WHERE enabled=1').all();
    const result = {};
    for (const row of rows.filter((item) => !body.connectionId || body.connectionId === item.id)) {
      try { await adapterFor(database, context, row.id).adapter.execute('test'); result[row.id] = { ok: true }; }
      catch { result[row.id] = { ok: false, message: 'Connection rejected or unavailable' }; }
    }
    return result;
  }
  if (path === '/api/v1/system/status' && method === 'GET') return { version: context.version, runtime: process.version, database: 'SQLite', uptime: Math.floor(process.uptime()), memoryBytes: process.memoryUsage().rss };
  if (path === '/api/v1/permissions' && method === 'GET') return permissions;
  if (path === '/api/v1/roles' && method === 'GET') return [
    { id: 'admin', name: 'Administrator', permissions, builtin: true },
    { id: 'viewer', name: 'Viewer', permissions: ['domain:read', 'dns:read', 'transfer:read'], builtin: true },
    ...database.prepare('SELECT * FROM roles ORDER BY name').all().map((role) => ({ id: role.id, name: role.name, permissions: JSON.parse(role.permissions_json), builtin: false })),
  ];
  const roleMatch = /^\/api\/v1\/roles\/([a-zA-Z0-9_-]+)$/.exec(path);
  if ((path === '/api/v1/roles' && method === 'POST') || (roleMatch && ['PUT', 'PATCH'].includes(method))) {
    requireValue(Array.isArray(body.permissions) && body.permissions.every((permission) => permissions.includes(permission)), 'Unknown permissions');
    const id = roleMatch?.[1] || randomUUID();
    requireValue(!['admin', 'viewer'].includes(id), 'Built-in roles cannot be modified');
    const name = text(body.name || '', 100);
    requireValue(name, 'Role name required');
    transaction(database, () => {
      database.prepare('INSERT INTO roles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions_json=excluded.permissions_json').run(id, name, JSON.stringify([...new Set(body.permissions)]));
      database.prepare('DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id=?)').run(id);
      log('role.save', name);
    });
    return { id };
  }
  if (roleMatch && method === 'DELETE') {
    requireValue(!['admin', 'viewer'].includes(roleMatch[1]), 'Built-in roles cannot be deleted');
    transaction(database, () => {
      database.prepare('DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id=?)').run(roleMatch[1]);
      database.prepare('DELETE FROM roles WHERE id=?').run(roleMatch[1]);
      log('role.delete', roleMatch[1]);
    });
    return { ok: true };
  }
  const userRolesMatch = /^\/api\/v1\/accounts\/([a-zA-Z0-9_-]+)\/roles$/.exec(path);
  if (userRolesMatch) {
    if (method === 'GET') return database.prepare('SELECT role_id FROM user_roles WHERE user_id=?').all(userRolesMatch[1]).map((row) => row.role_id);
    if (method === 'PUT') {
      requireValue(user.role === 'admin', 'Only an administrator can assign custom roles', 403);
      requireValue(Array.isArray(body.roleIds) && body.roleIds.length <= 20 && body.roleIds.every((id) => typeof id === 'string'), 'Invalid role IDs');
      requireValue(database.prepare('SELECT id FROM users WHERE id=?').get(userRolesMatch[1]), 'Account not found', 404);
      transaction(database, () => {
        if (typeof body.inheritViewer === 'boolean') database.prepare('UPDATE users SET base_permissions_json=? WHERE id=?').run(body.inheritViewer ? null : '[]', userRolesMatch[1]);
        database.prepare('DELETE FROM user_roles WHERE user_id=?').run(userRolesMatch[1]);
        for (const id of new Set(body.roleIds)) database.prepare('INSERT INTO user_roles VALUES(?,?)').run(userRolesMatch[1], id);
        database.prepare('DELETE FROM sessions WHERE user_id=?').run(userRolesMatch[1]);
        log('account.roles', userRolesMatch[1]);
      });
      return { ok: true };
    }
  }
  const accountMatch = /^\/api\/v1\/accounts\/([a-zA-Z0-9_-]+)$/.exec(path);
  const passwordMatch = /^\/api\/v1\/accounts\/([a-zA-Z0-9_-]+)\/password$/.exec(path);
  if (passwordMatch && method === 'POST') {
    const account = database.prepare('SELECT * FROM users WHERE id=?').get(passwordMatch[1]);
    requireValue(account, 'Account not found', 404);
    requireValue(account.role !== 'admin' || user.role === 'admin', 'Only administrators can reset administrator passwords', 403);
    if (account.id === user.id) requireValue(await verifyPassword(body.currentPassword, account.password_hash), 'Current password required');
    const hash = await hashPassword(body.password);
    transaction(database, () => {
      database.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, account.id);
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      log('account.password.reset', account.username);
    });
    if (account.id === user.id) removeInitialPassword(context.dataDirectory);
    return { ok: true, loginRequired: account.id === user.id };
  }
  if (accountMatch && method === 'DELETE') {
    const account = database.prepare('SELECT * FROM users WHERE id=?').get(accountMatch[1]);
    requireValue(account, 'Account not found', 404);
    requireValue(account.role !== 'admin' || user.role === 'admin', 'Only administrators can remove administrator accounts', 403);
    requireValue(account.id !== user.id, 'Cannot delete the signed-in account');
    requireValue(account.role !== 'admin' || account.status !== 'active' || database.prepare("SELECT count(*) AS count FROM users WHERE role='admin' AND status='active'").get().count > 1, 'Retain the last administrator');
    database.prepare('DELETE FROM users WHERE id=?').run(account.id);
    log('account.delete', account.username);
    return { ok: true };
  }
}
