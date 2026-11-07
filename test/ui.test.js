import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { publicAssets } from '../src/static.js';
import { validateBundle } from '../src/update.js';

test('static assets support nested Vben modules and skip symlinks and private files', () => {
  const root = mkdtempSync(join(tmpdir(), 'deck-assets-'));
  try {
    mkdirSync(join(root, 'js'));
    writeFileSync(join(root, 'index.html'), '<html>DomainDeck</html>');
    writeFileSync(join(root, 'js', 'app.js'), 'export default 1');
    writeFileSync(join(root, '.env'), 'secret');
    symlinkSync('/etc/passwd', join(root, 'leak.js'));
    const assets = publicAssets(pathToFileURL(`${root}/`));
    assert.ok(assets.has('/'));
    assert.equal(assets.get('/js/app.js').type, 'text/javascript; charset=utf-8');
    assert.equal(assets.has('/leak.js'), false);
    assert.equal(assets.has('/.env'), false);
    assert.equal(assets.has('/../package.json'), false);
  } finally { rmSync(root, { recursive: true }); }
});

test('Vben bundle validates nested references and binary assets', () => {
  const candidate = { version: '3.0.0-beta.6', files: [
    { path: 'package.json', content: JSON.stringify({ name: 'domaindeck-node', version: '3.0.0-beta.6' }) },
    { path: 'src/cli.js', content: '' },
    { path: 'public/index.html', content: '<script src="/js/app.js"></script>' },
    { path: 'public/js/app.js', content: 'export default 1' },
    { path: 'public/favicon.ico', encoding: 'base64', content: Buffer.from([0, 255, 4]).toString('base64') },
  ] };
  assert.equal(validateBundle(candidate), candidate);
  assert.throws(() => validateBundle({ ...candidate, files: candidate.files.filter((file) => file.path !== 'public/js/app.js') }), /Missing frontend asset/);
});
