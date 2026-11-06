import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('production entrypoint boots with isolated data, serves UI, and shuts down gracefully', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-cli-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url))], { env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, DOMAINDECK_DATA: directory, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password }) });
    assert.equal(login.status, 200);
    child.kill('SIGTERM');
    const [code] = await exit;
    assert.equal(code, 0);
  } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await exit; } rmSync(directory, { recursive: true }); }
});
