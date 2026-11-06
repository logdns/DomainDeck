import { chmodSync, mkdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { spawn } from 'node:child_process';
import { openDatabase } from './database.js';
import { initialize } from './initialize.js';
import { loadKey } from './vault.js';
import { createApp } from './server.js';
import { createUpdater } from './update.js';
import { createNotificationService } from './notifications.js';
import { seedDemo, demoTransport } from './demo.js';

process.umask(0o077);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (process.argv.includes('--version') || process.argv.includes('-version')) { console.log(version); process.exit(0); }
if (process.argv.includes('--help') || process.argv.includes('-help')) {
  console.log('DomainDeck --data DIRECTORY --addr HOST:PORT --open --auto-port=false --demo --version');
  process.exit(0);
}
const args = process.argv.slice(2).flatMap((value) => value.includes('=') ? [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)] : [value]);
const argument = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] || fallback : fallback; };
const address = argument('-addr', argument('--addr', ''));
let host = process.env.HOST || '127.0.0.1';
let requestedPort = Number(process.env.PORT || 4780);
if (address) { const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(address); if (!match) throw new Error('Invalid -addr'); host = match[1] || match[2]; requestedPort = Number(match[3]); }
const demo = (args.includes('-demo') && argument('-demo', 'true') !== 'false') || (args.includes('--demo') && argument('--demo', 'true') !== 'false');
const dataDirectory = resolve(argument('-data', argument('--data', demo ? join(tmpdir(), `domaindeck-demo-${process.pid}`) : process.env.DOMAINDECK_DATA || './data-node')));
if (demo && existsSync(dataDirectory)) throw new Error('Demo requires a new, separate data directory');
if (demo && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Demo binds to loopback only');
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
chmodSync(dataDirectory, 0o700);
const database = openDatabase(join(dataDirectory, 'domaindeck.sqlite'));
const created = await initialize(database, dataDirectory);
const key = loadKey(join(dataDirectory, 'vault.key'), database.prepare('SELECT (SELECT count(*) FROM connections) + (SELECT count(*) FROM notification_channels) AS count').get().count === 0);
if (demo) seedDemo(database, key);
let server;
const shutdown = () => { clearInterval(notificationTimer); server.close(() => { database.close(); process.exit(0); }); setTimeout(() => process.exit(1), 5000).unref(); };
const updater = demo ? undefined : createUpdater({ version, dataDirectory, database, installDirectory: process.env.DOMAINDECK_INSTALL, restart: shutdown });
const notifications = createNotificationService(database, { key, ...(demo ? { notificationTransport: async () => { throw new Error('Demo delivery disabled'); }, mailSender: async () => { throw new Error('Demo mail disabled'); } } : {}) });
const notificationTimer = setInterval(() => { notifications.run().catch(() => {}); }, 60 * 60 * 1000);
notificationTimer.unref();
server = createApp(database, { key, dataDirectory, version, updater, notifications, ...(demo ? { transport: demoTransport, demo: true } : {}) });
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('Invalid PORT');
const autoPort = argument('-auto-port', argument('--auto-port', 'true')) !== 'false' && !args.includes('--no-auto-port') && ['127.0.0.1', 'localhost', '::1'].includes(host);
const openBrowser = (args.includes('-open') && argument('-open', 'true') !== 'false') || (args.includes('--open') && argument('--open', 'true') !== 'false');
let retries = 0;
server.once('listening', () => {
  const actual = server.address().port;
  try { appendFileSync(join(dataDirectory, 'domaindeck.log'), `${new Date().toISOString()} listening ${host}:${actual}\n`, { mode: 0o600 }); } catch {}
  console.log(`DomainDeck ${version} listening on ${host}:${actual}`);
  if (created) console.log(`Initial administrator: admin. Read ${join(dataDirectory, 'initial-admin-password')}`);
  if (openBrowser) {
    const url = `http://${host.includes(':') ? `[${host}]` : host}:${actual}`;
    const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
    const commandArgs = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
    try { const browser = spawn(command, commandArgs, { detached: true, stdio: 'ignore' }); browser.on('error', () => {}); browser.unref(); } catch {}
  }
});
const listen = (port) => server.listen(port, host);
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && autoPort && retries++ < 20 && requestedPort > 0 && requestedPort < 65535) { requestedPort += 1; listen(requestedPort); return; }
  throw error;
});
listen(requestedPort);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
