import { createServer } from 'node:http';
import { authenticateAccount } from './accounts.js';
import { createSession, deleteSession, getSessionUser } from './sessions.js';
import { HttpError, resource } from './resources.js';
import { authorize, userPermissions } from './permissions.js';
import { publicOrigin, allowsOrigin } from './origin.js';
import { vbenResource } from './vben.js';
import { publicAssets, sendAsset } from './static.js';

const assets = publicAssets();

function respond(response, status, data, message = 'ok') {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ code: status >= 400 ? status : 0, data, message }));
}

async function readBody(request, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request body');
  return body;
}

export function createApp(database, options = {}) {
  const configuredOrigin = publicOrigin(options.publicOrigin);
  const attempts = new Map();
  let authenticating = 0;
  let mutations = 0;
  return createServer({ requestTimeout: 30000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let mutation = false;
    try {
      const requestedPath = new URL(request.url, 'http://localhost').pathname;
      const vben = requestedPath.startsWith('/api/vben/');
      const path = vben ? requestedPath.replace('/api/vben/', '/api/v1/') : requestedPath;
      const method = request.method;
      if (method === 'GET' && assets.has(path)) {
        sendAsset(response, assets.get(path));
        return;
      }
      if (method === 'GET' && path === '/api/health') { respond(response, 200, { status: 'ok', version: options.version }); return; }
      if (request.headers.origin) {
        if (!allowsOrigin(request.headers.origin, request.headers.host, configuredOrigin)) throw new HttpError(403, 'Cross-origin request rejected');
      }
      if (method === 'POST' && path === '/api/v1/auth/login') {
        const now = Date.now();
        for (const [address, failure] of attempts) if (failure.until <= now) attempts.delete(address);
        const address = request.socket.remoteAddress || 'unknown';
        const failure = attempts.get(address);
        if ((failure?.count || 0) >= 10 || authenticating >= 4 || attempts.size >= 10000) throw new HttpError(429, 'Too many login attempts');
        attempts.set(address, { count: (failure?.count || 0) + 1, until: failure?.until || now + 60000 });
        authenticating += 1;
        let account;
        try {
          const body = await readBody(request, 16384);
          account = await authenticateAccount(database, body.username, body.password);
        } finally { authenticating -= 1; }
        if (!account) throw new HttpError(401, 'Invalid credentials');
        attempts.delete(address);
        respond(response, 200, createSession(database, account.id));
        return;
      }
      const header = request.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const user = getSessionUser(database, token);
      if (!user) throw new HttpError(401, 'Unauthorized');
      if (method === 'GET' && path === '/api/v1/user/info') {
        const permissions = userPermissions(database, user);
        const homePath = [['domain:read', '/overview'], ['dns:read', '/dns'], ['payment:read', '/payments'], ['settings:read', '/settings'], ['account:read', '/system/accounts'], ['role:read', '/system/roles']].find(([permission]) => permissions.includes(permission))?.[1] || '/access-denied';
        respond(response, 200, { ...JSON.parse(database.prepare('SELECT profile_json FROM users WHERE id=?').get(user.id).profile_json), userId: user.id, username: user.username, role: user.role, roles: [user.role === 'admin' ? 'super' : 'viewer'], homePath, permissions }); return;
      }
      if (method === 'POST' && path === '/api/v1/auth/logout') { deleteSession(database, token); respond(response, 200, { ok: true }); return; }
      authorize(database, user, path, method);
      if (options.demo && path === '/api/v1/lookup') throw new HttpError(409, 'External DNS queries are disabled in demo mode');
      if (method !== 'GET') {
        if (mutations >= 1) throw new HttpError(409, 'Another change is in progress; retry shortly');
        mutations += 1;
        mutation = true;
      }
      const body = method === 'GET' ? {} : await readBody(request, path.endsWith('/import') ? 1024 * 1024 : path.includes('/providers/custom') || path === '/api/v1/notifications' ? 128000 : 16384);
      respond(response, 200, await (vben ? vbenResource : resource)(database, { ...options, user, method, path, body, query: new URL(request.url, 'http://localhost').searchParams }));
    } catch (error) {
      const status = error.status || (error.code?.startsWith('ERR_SQLITE') ? 409 : 500);
      if (!response.headersSent) respond(response, status, null, error.status ? error.message : status === 409 ? 'Data conflict or invalid fields' : 'Internal server error');
      else response.destroy();
    } finally { if (mutation) mutations -= 1; }
  });
}
