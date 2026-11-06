const words = {
  zh: { overview: '资产概览', domains: '域名资产', connections: '注册商与接入', accounts: '账户权限', audit: '操作审计', settings: '版本与设置', workspace: '域名工作空间', greeting: '让每一个域名，都井然有序。', subtitle: '集中管理域名资产、解析记录与到期时间。', total: '域名总数', connected: '已配置接入', expiring: '30 天内到期', login: '登录工作台', username: '用户名', password: '密码', welcome: '欢迎回来', loginHint: '使用管理员账户访问你的域名工作台。', bootstrap: '首次部署：在服务器数据目录读取 initial-admin-password。', logout: '退出', refresh: '刷新', add: '添加', name: '名称', provider: '服务商', expiry: '到期时间', actions: '操作', empty: '这里还没有数据', start: '添加接入并同步，开始管理你的域名。', sync: '同步域名', test: '测试连接', remove: '删除', cancel: '取消', save: '保存', search: '搜索域名或注册商…', role: '角色', status: '状态', admin: '管理员', viewer: '只读', active: '启用', disabled: '停用', edit: '编辑', currentPassword: '当前密码（编辑自己时必填）', newPassword: '新密码（留空保持原密码）', notes: '备注', renew: '自动续费', yes: '开启', no: '关闭', unknown: '未提供', export: '导出 JSON', import: '导入 JSON', success: '操作已完成', confirmDelete: '确定删除？域名仅从本地资产列表移除；删除 DNS 会影响实际解析。', connectionHint: 'Porkbun 需启用 API 访问。Cloudflare 同步账户内 DNS 区域；Spaceship 使用官方 API Key 与 Secret。密钥加密保存，不在页面回显。', accountHint: '修改自己的资料后需重新登录。系统始终保留至少一位启用的管理员。', updateHint: '通过 GitHub Release 查询 Node 3.x 更新。Linux systemd 安装支持校验、备份与在线替换；旧 Go 版本不会自动覆盖。', check: '查询新版本', apply: '更新并重启', current: '当前版本', latest: '已是当前频道最新版本', updateConfirm: '更新将备份数据库并重启服务，是否继续？', restarting: '已切换新版，服务正在重启。请稍后刷新。', dnsHint: 'DNS 修改会立即提交至服务商。Spaceship 当前版本支持域名同步和 DNS 查看。', content: '记录内容', recordName: '主机名（@ 为根域）', type: '记录类型', priority: '优先级', close: '关闭', auditHint: '最近 200 条管理操作记录，不包含密钥和密码。', date: '时间', target: '对象', action: '操作', importHint: '导入 JSON 数组，或包含 domains 数组的对象。每条记录需有 name 或 domain 字段；不导入旧账户密码与凭据。', readOnly: '只读模式', loginAgain: '资料已更新，请重新登录。' },
  en: { overview: 'Overview', domains: 'Domains', connections: 'Connections', accounts: 'Accounts', audit: 'Audit log', settings: 'Updates & settings', workspace: 'Domain workspace', greeting: 'Every domain. In its place.', subtitle: 'Manage your domains, DNS records and renewals in one place.', total: 'Total domains', connected: 'Connections', expiring: 'Expiring in 30 days', login: 'Sign in', username: 'Username', password: 'Password', welcome: 'Welcome back', loginHint: 'Sign in to your domain workspace.', bootstrap: 'First login: read initial-admin-password in the server data directory.', logout: 'Sign out', refresh: 'Refresh', add: 'Add', name: 'Name', provider: 'Provider', expiry: 'Expires', actions: 'Actions', empty: 'No data yet', start: 'Add a connection and sync your domains to get started.', sync: 'Sync domains', test: 'Test connection', remove: 'Delete', cancel: 'Cancel', save: 'Save', search: 'Search domains or connections…', role: 'Role', status: 'Status', admin: 'Administrator', viewer: 'Viewer', active: 'Active', disabled: 'Disabled', edit: 'Edit', currentPassword: 'Current password (required for your own account)', newPassword: 'New password (leave blank to keep)', notes: 'Notes', renew: 'Auto renew', yes: 'On', no: 'Off', unknown: 'Not provided', export: 'Export JSON', import: 'Import JSON', success: 'Done', confirmDelete: 'Delete this item? Domain removal is local only; DNS deletion affects live records.', connectionHint: 'Enable Porkbun API access. Cloudflare syncs DNS zones. Spaceship uses its official API key and secret. Credentials are encrypted and never returned.', accountHint: 'Editing your own account requires signing in again. At least one active administrator must remain.', updateHint: 'Check GitHub Releases for Node 3.x updates. The Linux systemd installer supports verified updates and database backups. Go installations are not overwritten.', check: 'Check for updates', apply: 'Update & restart', current: 'Current version', latest: 'Up to date on this channel', updateConfirm: 'Back up the database, update and restart now?', restarting: 'Version switched. Service is restarting; refresh shortly.', dnsHint: 'DNS writes are sent to the provider immediately. Spaceship DNS is read-only in this release.', content: 'Content', recordName: 'Record name (@ for root)', type: 'Type', priority: 'Priority', close: 'Close', auditHint: 'The latest 200 administrative events. Credentials are excluded.', date: 'Time', target: 'Target', action: 'Action', importHint: 'Import a JSON array or an object with a domains array. Each entry needs name or domain. Old passwords and credentials are not imported.', readOnly: 'Read only', loginAgain: 'Account updated. Please sign in again.' },
};
let language = localStorage.getItem('language') === 'en' ? 'en' : 'zh';
let theme = localStorage.getItem('theme') || 'light';
let token = sessionStorage.getItem('token') || '';
let user = null;
let currentPage = 'overview';
let pageData;
let domains = [];
let accounts = [];
let generation = 0;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const translate = (key) => words[language][key] || key;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const button = (action, label, id = '', extra = '') => `<button data-action="${action}" data-id="${escape(id)}" ${extra}>${escape(translate(label))}</button>`;
const field = (name, label, value = '', type = 'text', required = true) => `<label>${escape(translate(label))}<input name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${type === 'password' ? 'autocomplete="new-password"' : ''}></label>`;
const select = (name, label, entries, selected) => `<label>${escape(translate(label))}<select name="${name}">${entries.map((entry) => `<option value="${escape(entry)}" ${entry === selected ? 'selected' : ''}>${escape(translate(entry))}</option>`).join('')}</select></label>`;
function notice(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => { toast.hidden = true; }, 5000); }
function setTheme() { document.documentElement.classList.toggle('theme-dark', theme === 'dark'); document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== '/auth/login') signOut(); throw new Error(result.message); }
  return result.data;
}
function signOut() { token = ''; user = null; sessionStorage.removeItem('token'); dialog.close(); renderLogin(); }
function renderLogin() {
  setTheme();
  app.innerHTML = `<main class="login-page"><section class="login-story"><div class="brand"><span class="brand-mark">D</span>DomainDeck</div><div><span class="eyebrow">YOUR DOMAIN, YOUR SPACE</span><h1>${translate('greeting')}</h1><p>${translate('subtitle')}</p></div><div class="story-tags"><span>Porkbun</span><span>Cloudflare</span><span>Spaceship</span></div></section><section class="login-main"><div class="login-card"><span class="eyebrow">DOMAIN WORKSPACE</span><h1>${translate('welcome')}</h1><p class="muted">${translate('loginHint')}</p><form id="login-form"><label>${translate('username')}<input name="username" autocomplete="username" required></label><label>${translate('password')}<input name="password" type="password" autocomplete="current-password" required></label><div class="error" role="alert"></div><button class="primary" type="submit">${translate('login')}</button></form><p class="login-note">${translate('bootstrap')}</p><div class="login-tools">${button('language', language === 'zh' ? 'English' : '中文')}${button('theme', theme === 'light' ? '◐' : '☀')}</div></div></section></main>`;
}
function shell() {
  setTheme();
  const pages = ['overview', 'domains', 'connections', ...(user.role === 'admin' ? ['accounts', 'audit', 'settings'] : [])];
  const icons = { overview: '◈', domains: '◎', connections: '⇄', accounts: '♙', audit: '☷', settings: '⚙' };
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">D</span>DomainDeck</div><nav aria-label="Navigation">${pages.map((page) => `<button class="nav-item ${page === currentPage ? 'active' : ''}" data-action="navigate" data-id="${page}"><span class="nav-icon">${icons[page]}</span>${translate(page)}</button>`).join('')}</nav><div class="sidebar-foot"><strong>DomainDeck 3</strong><br>Node.js + SQLite<br>${user.role === 'admin' ? 'Porkbun · Cloudflare · Spaceship' : translate('readOnly')}</div></aside><section class="workspace"><header class="topbar"><span class="muted">${translate('workspace')} / ${translate(currentPage)}</span><div class="top-actions">${button('language', language === 'zh' ? 'EN' : '中文')}${button('theme', theme === 'light' ? '◐' : '☀')}<span class="avatar">${escape(user.username[0].toUpperCase())}</span><strong>${escape(user.username)}</strong>${button('logout', 'logout')}</div></header><main class="content"><div class="page-head"><div><div class="eyebrow">DOMAINDECK WORKSPACE</div><h1>${translate(currentPage)}</h1><p>${translate(currentPage === 'overview' ? 'subtitle' : currentPage === 'connections' ? 'connectionHint' : currentPage === 'accounts' ? 'accountHint' : currentPage === 'audit' ? 'auditHint' : currentPage === 'settings' ? 'updateHint' : 'start')}</p></div><div class="actions">${button('refresh', 'refresh')}${user.role === 'admin' && ['domains', 'connections', 'accounts'].includes(currentPage) ? button('add', 'add', '', 'class="primary"') : ''}</div></div><div id="page-content" class="loading">…</div></main></section></div>`;
}
const empty = () => `<div class="empty"><div class="empty-symbol">◎</div><strong>${translate('empty')}</strong><p>${translate('start')}</p></div>`;
function table(headers, rows) { return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map((heading) => `<th>${translate(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(); }
function domainTable(entries) { return table(['name', 'provider', 'expiry', 'renew', 'actions'], entries.map((item) => [`<strong>${escape(item.name)}</strong>`, `<span class="badge">${escape(item.provider || 'Manual')}</span>`, escape(item.expires_at ? item.expires_at.slice(0, 10) : translate('unknown')), translate(item.auto_renew ? 'yes' : 'no'), `${item.connection_id ? button('dns', 'DNS', item.id) : ''} ${user.role === 'admin' ? button('delete-domain', 'remove', item.id, 'class="danger"') : ''}`])); }
async function loadPage() {
  const revision = ++generation;
  shell();
  try {
    const data = currentPage === 'settings' ? await api('/overview') : await api(`/${currentPage}`);
    if (revision !== generation || !user) return;
    pageData = data;
    const content = document.querySelector('#page-content');
    content.className = '';
    if (currentPage === 'overview') {
      const recent = await api('/domains');
      if (revision !== generation) return;
      domains = recent;
      content.innerHTML = `<section class="hero"><div><span class="eyebrow">A CLEAR VIEW OF YOUR DOMAINS</span><h2>${translate('greeting')}</h2><p>${translate('subtitle')}</p></div><div class="hero-orbit">◎</div></section><div class="metrics">${[['total', data.domains, 'ASSETS'], ['connected', data.connections, 'PROVIDERS'], ['expiring', data.expiring, '30 DAYS']].map(([label, value, badge]) => `<section class="card metric"><div><span class="muted">${translate(label)}</span><strong>${value}</strong><small>${translate('workspace')}</small></div><span class="badge">${badge}</span></section>`).join('')}</div><section class="card"><div class="section-heading"><h2>${translate('domains')}</h2>${button('navigate', 'domains', 'domains')}</div>${domainTable(recent.slice(0, 8))}</section>`;
    } else if (currentPage === 'domains') {
      domains = data;
      content.innerHTML = `<section class="card"><div class="section-heading"><input id="search" class="search" aria-label="${translate('search')}" placeholder="${translate('search')}"><div class="actions">${button('export', 'export')}${user.role === 'admin' ? button('import', 'import') : ''}</div></div><div id="domain-table">${domainTable(data)}</div></section>`;
    } else if (currentPage === 'connections') {
      content.innerHTML = `<div class="notice">${translate('connectionHint')}</div><div class="connection-grid">${data.length ? data.map((item) => `<section class="card"><span class="badge">${escape(item.provider.toUpperCase())}</span><h2>${escape(item.name)}</h2><p class="muted">${escape(item.created_at.slice(0, 10))}</p><div class="actions">${user.role === 'admin' ? button('sync', 'sync', item.id, 'class="primary"') + button('test', 'test', item.id) + button('delete-connection', 'remove', item.id, 'class="danger"') : ''}</div></section>`).join('') : empty()}</div>`;
    } else if (currentPage === 'accounts') {
      accounts = data;
      content.innerHTML = `<section class="card">${table(['username', 'role', 'status', 'actions'], data.map((account) => [`<strong>${escape(account.username)}</strong>`, `<span class="badge">${translate(account.role)}</span>`, translate(account.status), button('edit-account', 'edit', account.id)]))}</section>`;
    } else if (currentPage === 'audit') {
      content.innerHTML = `<section class="card">${table(['date', 'username', 'action', 'target'], data.map((item) => [escape(item.created_at.replace('T', ' ').slice(0, 19)), escape(item.username), escape(item.action), escape(item.target)]))}</section>`;
    } else {
      content.innerHTML = `<section class="card"><div class="section-heading"><h2>${translate('current')}: ${escape(data.version)}</h2><span class="badge">Node.js + SQLite</span></div><p class="muted">${translate('updateHint')}</p><div class="actions">${button('check-update', 'check', '', 'class="primary"')}<span id="update-result" role="status"></span></div></section>`;
    }
  } catch (error) { if (revision === generation && user) { document.querySelector('#page-content').textContent = error.message; notice(error.message); } }
}
function modal(title, content, kind) {
  document.querySelector('#dialog-body').innerHTML = `<h2>${escape(translate(title))}</h2><form id="modal-form" data-kind="${kind}">${content}<div class="error" role="alert"></div><div class="actions">${button('close', 'cancel', '', 'type="button"')}<button class="primary" type="submit">${translate('save')}</button></div></form>`;
  dialog.showModal();
}
function addForm() {
  if (currentPage === 'connections') { modal('connections', field('name', 'name') + select('provider', 'provider', ['porkbun', 'cloudflare', 'spaceship'], 'porkbun') + '<div id="credential-fields"></div>', 'connection'); credentialFields(); }
  if (currentPage === 'domains') modal('domains', field('name', 'name') + field('expiresAt', 'expiry', '', 'date', false) + field('notes', 'notes', '', 'text', false), 'domain');
  if (currentPage === 'accounts') modal('accounts', field('username', 'username') + field('password', 'password', '', 'password') + select('role', 'role', ['viewer', 'admin'], 'viewer') + select('status', 'status', ['active', 'disabled'], 'active'), 'account');
}
function credentialFields() {
  const provider = document.querySelector('[name="provider"]').value;
  document.querySelector('#credential-fields').innerHTML = (provider === 'cloudflare' ? field('token', 'API Token', '', 'password') + field('accountId', 'Account ID') : field('apiKey', 'API Key', '', 'password') + field(provider === 'spaceship' ? 'apiSecret' : 'secretKey', 'API Secret', '', 'password'));
}
async function showDns(id) {
  const domain = domains.find((item) => item.id === id);
  if (!domain) return;
  const records = await api(`/domains/${id}/dns`);
  const canWrite = user.role === 'admin' && domain.provider !== 'spaceship';
  document.querySelector('#dialog-body').innerHTML = `<h2>DNS · ${escape(domain.name)}</h2><p class="muted">${translate('dnsHint')}</p>${table(['type', 'name', 'content', 'actions'], records.map((record) => [escape(record.type), escape(record.name), escape(record.content), canWrite ? button('delete-record', 'remove', `${id}:${record.id}`, 'type="button" class="danger"') : '—']))}${canWrite ? `<form id="modal-form" data-kind="dns" data-domain="${id}"><div class="field-pair">${select('type', 'type', ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'], 'A')}${field('name', 'recordName', '@')}</div>${field('content', 'content')}<div class="field-pair">${field('ttl', 'TTL', '600', 'number')}${field('priority', 'priority', '0', 'number')}</div><div class="error" role="alert"></div><button class="primary">${translate('add')}</button></form>` : ''}<div class="actions">${button('close', 'close', '', 'type="button"')}</div>`;
  if (!dialog.open) dialog.showModal();
}
document.addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    const query = event.target.value.toLowerCase();
    document.querySelector('#domain-table').innerHTML = domainTable(domains.filter((item) => `${item.name} ${item.provider} ${item.connection_name}`.toLowerCase().includes(query)));
  }
});
document.addEventListener('change', (event) => { if (event.target.name === 'provider') credentialFields(); });
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  target.disabled = true;
  try {
    if (action === 'language') { language = language === 'zh' ? 'en' : 'zh'; localStorage.setItem('language', language); if (user) await loadPage(); else renderLogin(); }
    else if (action === 'theme') { theme = theme === 'light' ? 'dark' : 'light'; localStorage.setItem('theme', theme); setTheme(); }
    else if (action === 'logout') { await api('/auth/logout', 'POST'); signOut(); }
    else if (action === 'navigate') { currentPage = id; await loadPage(); }
    else if (action === 'refresh') await loadPage();
    else if (action === 'close') dialog.close();
    else if (action === 'add') addForm();
    else if (action === 'sync' || action === 'test') { const result = await api(`/connections/${id}/${action}`, 'POST'); notice(`${translate('success')} · ${result.domains}`); await loadPage(); }
    else if (action === 'delete-domain' || action === 'delete-connection') { if (confirm(translate('confirmDelete'))) { await api(`/${action === 'delete-domain' ? 'domains' : 'connections'}/${id}`, 'DELETE'); await loadPage(); } }
    else if (action === 'edit-account') {
      const account = accounts.find((item) => item.id === id);
      modal('accounts', field('username', 'username', account.username) + field('password', 'newPassword', '', 'password', false) + (id === user.userId ? field('currentPassword', 'currentPassword', '', 'password') : '') + select('role', 'role', ['admin', 'viewer'], account.role) + select('status', 'status', ['active', 'disabled'], account.status), 'account-edit');
      document.querySelector('#modal-form').dataset.id = id;
    } else if (action === 'dns') await showDns(id);
    else if (action === 'delete-record') { if (confirm(translate('confirmDelete'))) { const [domain, record] = id.split(':'); await api(`/domains/${domain}/dns/${record}`, 'DELETE'); await showDns(domain); } }
    else if (action === 'import') modal('import', `<p class="muted">${translate('importHint')}</p><label>JSON<textarea name="json" required></textarea></label>`, 'import');
    else if (action === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ domains }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'domaindeck-domains.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === 'check-update') {
      const result = await api('/update/check', 'POST');
      document.querySelector('#update-result').innerHTML = result.available ? `${escape(result.version)} ${result.installSupported ? button('apply-update', 'apply') : ''}` : escape(translate('latest'));
    } else if (action === 'apply-update' && confirm(translate('updateConfirm'))) { await api('/update/apply', 'POST'); notice(translate('restarting')); }
  } catch (error) { notice(error.message); } finally { target.disabled = false; }
});
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('[type="submit"],button.primary');
  const values = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  try {
    if (form.id === 'login-form') {
      token = (await api('/auth/login', 'POST', values)).accessToken;
      sessionStorage.setItem('token', token);
      user = await api('/user/info'); currentPage = 'overview'; await loadPage(); return;
    }
    const kind = form.dataset.kind;
    if (kind === 'connection') await api('/connections', 'POST', { name: values.name, provider: values.provider, credentials: values });
    else if (kind === 'domain') await api('/domains', 'POST', values);
    else if (kind === 'account') await api('/accounts', 'POST', values);
    else if (kind === 'account-edit') { const result = await api(`/accounts/${form.dataset.id}`, 'PATCH', values); if (result.loginRequired) { signOut(); notice(translate('loginAgain')); return; } }
    else if (kind === 'import') { const parsed = JSON.parse(values.json); await api('/domains/import', 'POST', { domains: Array.isArray(parsed) ? parsed : parsed.domains }); }
    else if (kind === 'dns') { await api(`/domains/${form.dataset.domain}/dns`, 'POST', values); await showDns(form.dataset.domain); notice(translate('success')); return; }
    dialog.close(); notice(translate('success')); await loadPage();
  } catch (error) { const output = form.querySelector('.error'); if (output) output.textContent = error.message; else notice(error.message); } finally { submit.disabled = false; }
});
setTheme();
if (token) { try { user = await api('/user/info'); await loadPage(); } catch { signOut(); } } else renderLogin();
