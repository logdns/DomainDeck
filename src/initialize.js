import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccount } from './accounts.js';

export async function initialize(database, directory) {
  const passwordPath = join(directory, 'initial-admin-password');
  if (database.prepare('SELECT count(*) AS count FROM users').get().count) return false;
  const password = existsSync(passwordPath) ? readFileSync(passwordPath, 'utf8').trim() : randomBytes(24).toString('base64url');
  if (!existsSync(passwordPath)) writeFileSync(passwordPath, `${password}\n`, { mode: 0o600, flag: 'wx' });
  await createAccount(database, { username: 'admin', password });
  return true;
}

export function removeInitialPassword(directory) {
  if (!directory) return;
  try { unlinkSync(join(directory, 'initial-admin-password')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
