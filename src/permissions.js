import { HttpError } from './errors.js';

export const permissions = ['domain:read', 'domain:write', 'domain:billing', 'transfer:read', 'transfer:write', 'dns:read', 'dns:write', 'payment:read', 'payment:write', 'settings:read', 'settings:write', 'audit:read', 'account:read', 'account:write', 'role:read', 'role:write'];
const viewerPermissions = ['domain:read', 'dns:read', 'transfer:read'];

export function userPermissions(database, user) {
  if (user.role === 'admin') return [...permissions];
  const extra = database.prepare('SELECT roles.permissions_json FROM roles JOIN user_roles ON roles.id=user_roles.role_id WHERE user_roles.user_id=?').all(user.id);
  const explicit = database.prepare('SELECT base_permissions_json FROM users WHERE id=?').get(user.id)?.base_permissions_json;
  return [...new Set([...(explicit ? JSON.parse(explicit) : viewerPermissions), ...extra.flatMap((role) => JSON.parse(role.permissions_json))])].filter((permission) => permissions.includes(permission));
}

export function can(user, permission) {
  return user.role === 'admin' || user.permissions?.includes(permission) === true;
}

export function requiredPermission(path, method) {
  const read = method === 'GET';
  if (path.endsWith('/auth/change-password') || path.endsWith('/auth/codes')) return null;
  if (/\/payments\/(sync|probe)$/.test(path)) return 'payment:read';
  if (/\/(connections\/[^/]+\/test|settings\/test|(?:system\/)?update\/check)$/.test(path)) return 'settings:read';
  if (path.endsWith('/purge')) return 'dns:write';
  if (/\/accounts\/balances$/.test(path)) return 'payment:read';
  if (/\/(accounts)(\/|$)/.test(path)) return `account:${read ? 'read' : 'write'}`;
  if (/\/(roles|permissions)(\/|$)/.test(path)) return `role:${read ? 'read' : 'write'}`;
  if (path.includes('/audit')) return 'audit:read';
  if (/\/(payments|payment-types|invoices|orders)(\/|$)/.test(path)) return `payment:${read ? 'read' : 'write'}`;
  if (path.includes('/dns') || path.endsWith('/lookup')) return `dns:${read ? 'read' : 'write'}`;
  if (/\/(register|renew)(\/|$)/.test(path)) return 'domain:billing';
  if (path.includes('/auth-code') || path.includes('/transfer-lock')) return 'transfer:write';
  if (path.endsWith('/availability') || path.endsWith('/transfer/quotes')) return 'domain:read';
  if (path.includes('/transfer')) return `transfer:${read ? 'read' : 'write'}`;
  if (path.includes('/operations')) return 'domain:read';
  if (/\/(connections|providers|notifications|settings|update|system)(\/|$)/.test(path)) return `settings:${read ? 'read' : 'write'}`;
  return `domain:${read ? 'read' : 'write'}`;
}

export function authorize(database, user, path, method) {
  user.permissions = userPermissions(database, user);
  const permission = requiredPermission(path, method);
  if (permission && !can(user, permission)) throw new HttpError(403, `Permission required: ${permission}`);
}
