import { createHash, randomBytes } from 'node:crypto';

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(database, userId, now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + 12 * 60 * 60 * 1000;
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash(token), userId, expiresAt);
  return { accessToken: token, expiresIn: 12 * 60 * 60 };
}

export function getSessionUser(database, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const account = database.prepare(`SELECT users.id, users.username, users.status, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'`)
    .get(tokenHash(token), now);
  return account ? { id: account.id, username: account.username, status: account.status, role: account.role } : null;
}

export function deleteSession(database, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}
