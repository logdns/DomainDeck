import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

async function render(role, language = 'zh', authenticated = true, permissions) {
  const nodes = new Map(['#app', '#page-content', '#toast', '#dialog', '#dialog-body'].map((name) => [name, { innerHTML: '', className: '', close() {}, showModal() {}, classList: { toggle() {} } }]));
  const events = new Map();
  const storage = (values) => ({ getItem: (key) => values[key] || null, setItem: (key, value) => { values[key] = value; }, removeItem: (key) => { delete values[key]; } });
  const document = { querySelector: (selector) => nodes.get(selector), documentElement: { classList: { toggle() {} } }, addEventListener: (name, handler) => events.set(name, handler) };
  const user = { userId: 'user-one', username: '<img src=x onerror=alert(1)>', role, permissions };
  const fixtures = {
    '/api/v1/user/info': user,
    '/api/v1/overview': { domains: 1, connections: 1, expiring: 0, version: '3.0.0-beta.1' },
    '/api/v1/domains': [{ id: 'domain-one', name: 'example.com', provider: 'porkbun', connection_name: '<script>alert(1)</script>', expires_at: '2030-01-01', auto_renew: 1, connection_id: 'connection-one' }],
    '/api/v1/connections': [{ id: 'connection-one', name: '<script>alert(1)</script>', provider: 'porkbun', created_at: '2026-11-06' }],
    '/api/v1/registrars': [{ id: 'connection-one', name: 'Porkbun', provider: 'porkbun' }],
    '/api/v1/providers': [{ id: 'porkbun', name: 'Porkbun', builtin: true, fields: ['apiKey', 'secretKey'] }],
    '/api/v1/orders': [], '/api/v1/payments': [],
    '/api/v1/notifications': { enabled: false, expiryDays: [30, 7], channels: [] },
    '/api/v1/roles': [{ id: 'admin', name: 'Administrator', builtin: true, permissions: ['domain:read'] }],
    '/api/v1/dns/zones': { items: [], notes: [] },
    '/api/v1/settings': { safety: { billingEnabled: false }, contacts: {} },
  };
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const utilities = await runInNewContext(`(async () => { ${source}\n return {csvCell}; })()`, {
    document,
    localStorage: storage({ language }),
    sessionStorage: storage(authenticated ? { token: 'dummy-token' } : {}),
    fetch: async (path) => ({ ok: true, json: async () => ({ data: fixtures[path] }) }),
    setTimeout, clearTimeout, console,
  }, { timeout: 1000 });
  return { nodes, events, utilities };
}

test('UI renders login in both languages without an authenticated token', async () => {
  const chinese = await render('admin', 'zh', false);
  assert.match(chinese.nodes.get('#app').innerHTML, /登录工作台/);
  const english = await render('admin', 'en', false);
  assert.match(english.nodes.get('#app').innerHTML, /Sign in/);
});

test('all migrated pages render in both languages and quoted pages work without settings permission', async () => {
  for (const language of ['zh', 'en']) {
    const admin = await render('admin', language);
    for (const page of ['domains', 'register', 'transfer', 'connections', 'dns', 'lookup', 'finance', 'orders', 'notifications', 'roles', 'providers', 'settings']) {
      await admin.events.get('click')({ target: { closest: () => ({ dataset: { action: 'navigate', id: page } }) } });
      assert.ok(admin.nodes.get('#page-content').innerHTML.includes('card') || page === 'connections', page);
      assert.ok(!admin.nodes.get('#app').innerHTML.includes('undefined'), page);
    }
  }
  const viewer = await render('viewer', 'en', true, ['domain:read', 'domain:billing']);
  assert.ok(!viewer.nodes.get('#app').innerHTML.includes('data-id="settings"'));
  await viewer.events.get('click')({ target: { closest: () => ({ dataset: { action: 'navigate', id: 'register' } }) } });
  assert.match(viewer.nodes.get('#page-content').innerHTML, /data-kind="quotes"/);
});

test('UI escapes stored names and removes administrator navigation for viewers', async () => {
  const viewer = await render('viewer');
  const html = viewer.nodes.get('#app').innerHTML;
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(!html.includes('data-id="accounts"'));
  assert.ok(!html.includes('data-id="settings"'));
  const admin = await render('admin');
  assert.ok(admin.nodes.get('#app').innerHTML.includes('data-id="accounts"'));
  await admin.events.get('click')({ target: { closest: () => ({ dataset: { action: 'navigate', id: 'connections' } }) } });
  const connections = admin.nodes.get('#page-content').innerHTML;
  assert.ok(!connections.includes('<script>alert(1)</script>'));
  assert.ok(connections.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('CSV exports quote cells and neutralize spreadsheet formula prefixes', async () => {
  const { utilities } = await render('admin');
  assert.equal(utilities.csvCell('plain'), '"plain"');
  assert.equal(utilities.csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"');
  assert.equal(utilities.csvCell('  +command'), '"\'  +command"');
  assert.equal(utilities.csvCell('a"b'), '"a""b"');
});
