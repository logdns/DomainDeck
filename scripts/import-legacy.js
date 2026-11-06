import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { openDatabase } from '../src/database.js';
import { loadKey } from '../src/vault.js';
import { importLegacy } from '../src/migration.js';

process.umask(0o077);
const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) throw new Error('Usage: node scripts/import-legacy.js OLD_DATA_DIRECTORY NEW_EMPTY_DIRECTORY');
const source = resolve(sourceArgument);
const destination = resolve(destinationArgument);
const relation = relative(source, destination);
if (relation !== '..' && !relation.startsWith('../')) throw new Error('Destination cannot be inside the legacy snapshot');
if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) throw new Error('Source must be a real snapshot directory');
if (existsSync(destination)) throw new Error('Destination must be a new directory');
function read(file, fallback) {
  const path = join(source, file);
  if (!existsSync(path)) return fallback;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error(`Invalid source file: ${file}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
const snapshot = Object.fromEntries(['users', 'roles', 'payments', 'orders', 'audit', 'domains'].map((name) => [name, read(`${name}.json`, [])]));
snapshot.config = read('config.json', {});
snapshot.notifications = read('notifications.json', {});
snapshot.providers = [];
if (existsSync(join(source, 'providers'))) {
  if (lstatSync(join(source, 'providers')).isSymbolicLink()) throw new Error('Provider directory cannot be a symlink');
  for (const name of readdirSync(join(source, 'providers'))) if (/^[a-z][a-z0-9_-]+\.json$/.test(name)) snapshot.providers.push(read(`providers/${name}`, {}));
}
mkdirSync(destination, { mode: 0o700 });
const database = openDatabase(join(destination, 'domaindeck.sqlite'));
let succeeded = false;
try {
  const result = importLegacy(database, loadKey(join(destination, 'vault.key')), snapshot);
  succeeded = true;
  console.log(JSON.stringify(result));
  console.log('Migration completed. Billing and notification scheduling remain disabled until verified. Original files were read only.');
} finally {
  database.close();
  if (!succeeded) rmSync(destination, { recursive: true });
}
