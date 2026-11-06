import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.js';
import { compareVersions, createUpdater, validateBundle } from '../src/update.js';

function bundle(version = '3.0.0-beta.2') {
  return { version, files: ['src/cli.js', 'public/index.html', 'public/app.js', 'public/style.css'].map((path) => ({ path, content: '' })).concat({ path: 'package.json', content: JSON.stringify({ name: 'domaindeck-node', version }) }) };
}

test('bundle rejects traversal, duplicate paths, version mismatch and missing files', () => {
  assert.ok(validateBundle(bundle()));
  for (const path of ['../../data/vault.key', '/etc/passwd', 'src/../cli.js', 'src/nested/evil.js', '.env', 'public/app.js']) {
    const candidate = bundle(); candidate.files.push({ path, content: '' }); assert.throws(() => validateBundle(candidate));
  }
  assert.throws(() => validateBundle({ version: '3.0.0', files: [] }));
});

test('version ordering is numeric and stable versions follow betas', () => {
  assert.ok(compareVersions('3.0.0-beta.10', '3.0.0-beta.2') > 0);
  assert.ok(compareVersions('3.0.0', '3.0.0-beta.10') > 0);
  assert.ok(compareVersions('3.2.0', '3.10.0') < 0);
  assert.throws(() => compareVersions('2.2.1', '3.0.0'));
});

test('update requires GitHub digest and refuses checksum mismatch without switching code', async () => {
  let calls = 0;
  const bytes = Buffer.from(JSON.stringify(bundle()));
  const updater = createUpdater({ version: '3.0.0-beta.1', installDirectory: '/not-used', transport: async () => {
    calls += 1;
    if (calls === 1) return Response.json([{ tag_name: 'v3.0.0-beta.2', prerelease: true, assets: [{ name: 'DomainDeck-node.bundle.json', digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'https://github.com/logdns/DomainDeck/releases/download/v3.0.0-beta.2/DomainDeck-node.bundle.json' }] }]);
    return new Response(bytes);
  } });
  assert.equal((await updater.check()).available, true);
  await assert.rejects(updater.apply(), /checksum mismatch/);
  assert.notEqual(createHash('sha256').update(bytes).digest('hex'), '0'.repeat(64));
});

test('update rejects untrusted redirected hosts and missing digests', async () => {
  const redirected = createUpdater({ version: '3.0.0-beta.1', transport: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }) });
  await assert.rejects(redirected.check(), /Untrusted update URL/);
  const unsigned = createUpdater({ version: '3.0.0-beta.1', transport: async () => Response.json([{ tag_name: 'v3.0.0', assets: [{ name: 'DomainDeck-node.bundle.json' }] }]) });
  await assert.rejects(unsigned.check(), /SHA-256 digest/);
});

test('verified update creates a consistent backup and atomically changes the installation link', async () => {
  const root = mkdtempSync(join(tmpdir(), 'domaindeck-update-'));
  const dataDirectory = join(root, 'data');
  const previous = join(root, 'releases', 'previous');
  mkdirSync(dataDirectory);
  mkdirSync(previous, { recursive: true });
  symlinkSync(previous, join(root, 'current'));
  const database = openDatabase(join(dataDirectory, 'domaindeck.sqlite'));
  const bytes = Buffer.from(JSON.stringify(bundle()));
  const digest = createHash('sha256').update(bytes).digest('hex');
  let restarted = false;
  let requests = 0;
  const updater = createUpdater({ version: '3.0.0-beta.1', installDirectory: root, dataDirectory, database, restart: () => { restarted = true; }, transport: async () => {
    requests += 1;
    return requests === 1 ? Response.json([{ tag_name: 'v3.0.0-beta.2', prerelease: true, assets: [{ name: 'DomainDeck-node.bundle.json', digest: `sha256:${digest}`, browser_download_url: 'https://github.com/logdns/DomainDeck/releases/download/v3.0.0-beta.2/DomainDeck-node.bundle.json' }] }]) : new Response(bytes);
  } });
  try {
    await updater.check();
    assert.equal((await updater.apply()).version, '3.0.0-beta.2');
    const current = readlinkSync(join(root, 'current'));
    assert.notEqual(current, previous);
    assert.equal(JSON.parse(readFileSync(join(current, 'package.json'))).version, '3.0.0-beta.2');
    const backupPath = readdirSync(dataDirectory).find((name) => name.startsWith('before-update-'));
    assert.ok(backupPath);
    const backup = openDatabase(join(dataDirectory, backupPath));
    assert.equal(backup.prepare('SELECT count(*) AS count FROM users').get().count, 0);
    backup.close();
    await assert.rejects(updater.apply(), /Check for updates again/);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(restarted, true);
  } finally { database.close(); rmSync(root, { recursive: true }); }
});
