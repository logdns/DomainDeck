import { HttpError, requireValue } from './errors.js';
import { decrypt, encrypt } from './vault.js';

export const defaultSettings = {
  safety: { billingEnabled: false, confirmWrites: true },
  contacts: { registrant: '', admin: '', tech: '', billing: '' },
  notifications: { enabled: false, expiryDays: [30, 14, 7, 3, 1], notifyOnRenew: false },
};

export function setting(database, id) {
  const row = database.prepare('SELECT value FROM settings WHERE id=?').get(id);
  return row ? JSON.parse(row.value) : structuredClone(defaultSettings[id] || {});
}

export function saveSetting(database, id, value) {
  database.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id, JSON.stringify(value));
  return value;
}

export function audit(database, user, action, target = '') {
  database.prepare('INSERT INTO audit(username,action,target,created_at) VALUES(?,?,?,?)').run(user.username, action, String(target).slice(0, 300), new Date().toISOString());
}

export function transaction(database, callback) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function text(value, limit = 2000) {
  requireValue(typeof value === 'string' && value.length <= limit, 'Invalid text field');
  return value.trim();
}

export function connectionView(row) {
  return { id: row.id, name: row.name, provider: row.provider_ref || row.provider, enabled: Boolean(row.enabled), isDefault: Boolean(row.is_default), created_at: row.created_at };
}

export function connection(database, id, key, includeDisabled = false) {
  const row = database.prepare('SELECT * FROM connections WHERE id=?').get(id);
  if (!row) throw new HttpError(404, 'Connection not found');
  if (!row.enabled && !includeDisabled) throw new HttpError(409, 'Connection is disabled');
  return { ...row, provider: row.provider_ref || row.provider, credentials: decrypt(key, row.credentials) };
}

export function secureSetting(database, key, id, value) {
  if (value !== undefined) return saveSetting(database, id, encrypt(key, value));
  const row = database.prepare('SELECT value FROM settings WHERE id=?').get(id);
  return row ? decrypt(key, JSON.parse(row.value)) : {};
}
