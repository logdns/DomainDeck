import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../src/database.js';
import { providerList } from '../src/registry.js';

test('every supported registrar provides credential acquisition, permissions and field guidance', () => {
  const database = openDatabase(':memory:');
  try {
    const providers = providerList(database);
    for (const id of ['spaceship', 'porkbun', 'cloudflare', 'godaddy', 'namecheap']) {
      const provider = providers.find((item) => item.id === id);
      assert.ok(provider.docs.startsWith('https://'), id);
      assert.ok(provider.credentialsUrl.startsWith('https://'), id);
      assert.ok(provider.setup.length >= 3, id);
      assert.ok(provider.setup.every((step) => step.title && step.detail.length > 20), id);
      assert.ok(provider.fields.every((field) => field.key && field.label && field.help && field.placeholder), id);
      assert.ok(provider.fields.some((field) => field.secret), id);
    }
    const text = (id) => JSON.stringify(providers.find((provider) => provider.id === id));
    assert.match(text('spaceship'), /domains:billing/);
    assert.match(text('porkbun'), /API Access/);
    assert.match(text('cloudflare'), /DNS.*Read/);
    assert.match(text('godaddy'), /不能填 PAT/);
    assert.match(text('namecheap'), /公网出口 IPv4/);
    assert.equal(providers.find((provider) => provider.id === 'cloudflare').fields.find((field) => field.key === 'accountId').secret, false);
  } finally { database.close(); }
});

test('custom guide links reject unsafe schemes and embedded credentials without inheriting preset guidance', () => {
  const database = openDatabase(':memory:');
  try {
    database.prepare('INSERT INTO provider_manifests(id,manifest_json) VALUES(?,?)').run('godaddy', JSON.stringify({
      id: 'godaddy', name: 'Custom fixture', docs: 'javascript:alert(1)', credentialsUrl: 'https://user:secret@example.test/',
      fields: [{ key: 'customToken', label: 'Fixture', url: 'data:text/html,unsafe' }],
      setup: [{ title: 'Unsafe', detail: 'Fixture', url: 'http://example.test' }, { title: 'Safe', detail: 'Fixture', url: 'https://example.test/docs' }],
      ops: {},
    }));
    const provider = providerList(database).find((item) => item.id === 'godaddy');
    assert.equal(provider.preset, false);
    assert.equal(provider.docs, '');
    assert.equal(provider.credentialsUrl, '');
    assert.equal(provider.fields[0].url, '');
    assert.equal(provider.setup[0].url, '');
    assert.equal(provider.setup[1].url, 'https://example.test/docs');
    assert.equal(provider.fields[0].key, 'customToken');
    assert.equal(JSON.stringify(provider).includes('Classic'), false);
  } finally { database.close(); }
});
