import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openDatabase } from './database.js';
import { initialize } from './initialize.js';
import { loadKey } from './vault.js';
import { createApp } from './server.js';
import { createUpdater } from './update.js';
import { createNotificationService } from './notifications.js';

process.umask(0o077);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (process.argv.includes('--version')) { console.log(version); process.exit(0); }
const dataDirectory = resolve(process.env.DOMAINDECK_DATA || './data-node');
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
chmodSync(dataDirectory, 0o700);
const database = openDatabase(join(dataDirectory, 'domaindeck.sqlite'));
const created = await initialize(database, dataDirectory);
const key = loadKey(join(dataDirectory, 'vault.key'), database.prepare('SELECT (SELECT count(*) FROM connections) + (SELECT count(*) FROM notification_channels) AS count').get().count === 0);
let server;
const shutdown = () => { clearInterval(notificationTimer); server.close(() => { database.close(); process.exit(0); }); setTimeout(() => process.exit(1), 5000).unref(); };
const updater = createUpdater({ version, dataDirectory, database, installDirectory: process.env.DOMAINDECK_INSTALL, restart: shutdown });
const notifications = createNotificationService(database, { key });
const notificationTimer = setInterval(() => { notifications.run().catch(() => {}); }, 60 * 60 * 1000);
notificationTimer.unref();
server = createApp(database, { key, dataDirectory, version, updater, notifications });
const port = Number(process.env.PORT || 4780);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`DomainDeck ${version} listening on ${process.env.HOST || '127.0.0.1'}:${port}`);
  if (created) console.log(`Initial administrator: admin. Read ${join(dataDirectory, 'initial-admin-password')}`);
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
