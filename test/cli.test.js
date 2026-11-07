import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/database.js';
import { createAccount } from '../src/accounts.js';
import { createServer } from 'node:net';

test('production entrypoint boots with isolated data, serves UI, and shuts down gracefully', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-cli-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url))], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, DOMAINDECK_DATA: directory, DOMAINDECK_PUBLIC_ORIGIN: 'https://deck.example.test', HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exit = once(child, 'exit');
  try {
    for (let index = 0; index < 100 && !output.includes('listening'); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(output.includes('listening'), output);
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base);
    assert.match(await page.text(), /DomainDeck/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    for (const path of ['/app.js', '/style.css']) assert.equal((await fetch(base + path)).status, 200);
    const password = readFileSync(join(directory, 'initial-admin-password'), 'utf8').trim();
    assert.ok(!output.includes(password));
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { Origin: 'https://deck.example.test' }, body: JSON.stringify({ username: 'admin', password }) });
    assert.equal(login.status, 200);
    child.kill('SIGTERM');
    const [code] = await exit;
    assert.equal(code, 0);
  } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await exit; } rmSync(directory, { recursive: true }); }
});

test('invalid public origin fails before creating a data directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-invalid-origin-'));
  const data = join(directory, 'new-data');
  try {
    const failed = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--data', data, '--public-origin', 'https://deck.example.test/path'], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory }, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Invalid public origin/);
    assert.equal(existsSync(data), false);
  } finally { rmSync(directory, { recursive: true }); }
});

test('missing vault key with notification-only data fails startup without replacing the key', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-missing-key-'));
  const database = openDatabase(join(directory, 'domaindeck.sqlite'));
  try {
    await createAccount(database, { username: 'admin', password: 'fixture-password' });
    database.prepare('INSERT INTO notification_channels VALUES(?,?,?,?,?)').run('channel', 'Webhook', 'webhook', 1, 'encrypted-with-lost-key');
  } finally { database.close(); }
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url))], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, DOMAINDECK_DATA: directory }, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(directory, 'vault.key')), false);
  } finally { rmSync(directory, { recursive: true }); }
});

test('demo CLI seeds isolated providers, accepts port zero and blocks external DNS', async () => {
  const root = mkdtempSync(join(tmpdir(), 'domaindeck-demo-test-'));
  const directory = join(root, 'new-demo');
  const script = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const child = spawn(process.execPath, [script, '--demo', '--data', directory, '--addr', '127.0.0.1:0', '--open=false'], { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    for (let index = 0; index < 150 && !output.includes('listening'); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    const port = /listening on 127\.0\.0\.1:(\d+)/.exec(output)?.[1];
    assert.ok(port && port !== '0', output);
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: readFileSync(join(directory, 'initial-admin-password'), 'utf8').trim() }) });
    const token = (await response.json()).data.accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await (await fetch(`${base}/api/v1/domains`, { headers })).json()).data.length, 3);
    assert.equal((await fetch(`${base}/api/v1/lookup?domain=example.com`, { headers })).status, 409);
    assert.equal(spawnSync(process.execPath, [script, '--demo', '--data', directory], { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root }, timeout: 5000 }).status, 1);
    child.kill('SIGTERM');
    assert.equal((await exit)[0], 0);
  } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await exit; } rmSync(root, { recursive: true }); }
});

test('loopback port conflict selects a new port once and explicit opt-out fails', async () => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const port = occupied.address().port;
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-port-test-'));
  const script = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const child = spawn(process.execPath, [script, '--data', directory, '--addr', `127.0.0.1:${port}`], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    for (let index = 0; index < 150 && !output.includes('listening'); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    const actual = Number(/listening on 127\.0\.0\.1:(\d+)/.exec(output)?.[1]);
    assert.ok(actual > port && actual <= port + 20, output);
    assert.equal((output.match(/listening on/g) || []).length, 1);
    child.kill('SIGTERM');
    assert.equal((await exit)[0], 0);
    const failed = spawnSync(process.execPath, [script, '--data', directory, '--addr', `127.0.0.1:${port}`, '--auto-port=false'], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory }, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /EADDRINUSE/);
  } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await exit; } await new Promise((resolve) => occupied.close(resolve)); rmSync(directory, { recursive: true }); }
});
