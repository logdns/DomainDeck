import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const usernamePattern = /^[A-Za-z][A-Za-z0-9_.-]{2,31}$/;
const hashPattern = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/;

function validatePassword(password) {
  if (typeof password !== 'string' || [...password].length < 8 || Buffer.byteLength(password) > 512) {
    throw Object.assign(new Error('Password must contain at least 8 characters and at most 512 UTF-8 bytes'), { status: 400 });
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 512 || typeof encoded !== 'string') return false;
  const match = hashPattern.exec(encoded);
  if (!match) return false;
  const actual = await deriveKey(password, match[1], 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}

export async function createAccount(database, { username, password }) {
  if (typeof username !== 'string' || !usernamePattern.test(username)) {
    throw new Error('Invalid username');
  }
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, status, profile_json) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, passwordHash, 'active', '{}');
  return { id, username, status: 'active' };
}

export async function authenticateAccount(database, username, password) {
  if (typeof username !== 'string' || !usernamePattern.test(username)) return null;
  const find = database.prepare('SELECT id, username, password_hash, status FROM users WHERE username = ?');
  const account = find.get(username);
  if (!account || !(await verifyPassword(password, account.password_hash))) return null;
  const current = find.get(username);
  if (!current || current.id !== account.id || current.password_hash !== account.password_hash || current.status !== 'active') return null;
  return { id: current.id, username: current.username, status: current.status };
}
