import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword, authenticateAccount } from '../src/accounts.js';
import { openDatabase } from '../src/database.js';
import { decrypt } from '../src/vault.js';

test('offline migration CLI imports a fixture snapshot, refuses existing destination, preserves source bytes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-migration-'));
  const destination = join(directory, 'imported');
  const source = join(directory, 'legacy');
  mkdirSync(source);
  const script = fileURLToPath(new URL('../scripts/import-legacy.js', import.meta.url));
  const users = JSON.stringify([{ username: 'legacyadmin', roleCodes: ['super'], passwordHash: await hashPassword('legacy-password'), status: 'active' }]);
  writeFileSync(join(source, 'users.json'), users);
  writeFileSync(join(source, 'config.json'), JSON.stringify({ spaceship: { apiKey: 'fixture-key', apiSecret: 'fixture-secret' } }));
  const run = () => spawnSync(process.execPath, [script, source, destination], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory }, timeout: 5000 });
  try {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes('fixture-secret'));
    assert.equal(readFileSync(join(source, 'users.json'), 'utf8'), users);
    const database = openDatabase(join(destination, 'domaindeck.sqlite'));
    try {
      assert.ok(await authenticateAccount(database, 'legacyadmin', 'legacy-password'));
      const key = readFileSync(join(destination, 'vault.key'));
      assert.equal(decrypt(key, database.prepare('SELECT credentials FROM connections').get().credentials).apiSecret, 'fixture-secret');
    } finally { database.close(); }
    assert.notEqual(run().status, 0);
    assert.ok(existsSync(join(destination, 'vault.key')));
  } finally { rmSync(directory, { recursive: true }); }
});
