const words = {
  zh: { overview: '资产概览', domains: '域名资产', connections: '注册商与接入', accounts: '账户权限', audit: '操作审计', settings: '版本与设置', workspace: '域名工作空间', greeting: '让每一个域名，都井然有序。', subtitle: '集中管理域名资产、解析记录与到期时间。', total: '域名总数', connected: '已配置接入', expiring: '30 天内到期', login: '登录工作台', username: '用户名', password: '密码', welcome: '欢迎回来', loginHint: '使用管理员账户访问你的域名工作台。', bootstrap: '首次部署：在服务器数据目录读取 initial-admin-password。', logout: '退出', refresh: '刷新', add: '添加', name: '名称', provider: '服务商', expiry: '到期时间', actions: '操作', empty: '这里还没有数据', start: '添加接入并同步，开始管理你的域名。', sync: '同步域名', test: '测试连接', remove: '删除', cancel: '取消', save: '保存', search: '搜索域名或注册商…', role: '角色', status: '状态', admin: '管理员', viewer: '只读', active: '启用', disabled: '停用', edit: '编辑', currentPassword: '当前密码（编辑自己时必填）', newPassword: '新密码（留空保持原密码）', notes: '备注', renew: '自动续费', yes: '开启', no: '关闭', unknown: '未提供', export: '导出 JSON', import: '导入 JSON', success: '操作已完成', confirmDelete: '确定删除？域名仅从本地资产列表移除；删除 DNS 会影响实际解析。', connectionHint: 'Porkbun 需启用 API 访问。Cloudflare 同步账户内 DNS 区域；Spaceship 使用官方 API Key 与 Secret。密钥加密保存，不在页面回显。', accountHint: '修改自己的资料后需重新登录。系统始终保留至少一位启用的管理员。', updateHint: '通过 GitHub Release 查询 Node 3.x 更新。Linux systemd 安装支持校验、备份与在线替换；旧 Go 版本不会自动覆盖。', check: '查询新版本', apply: '更新并重启', current: '当前版本', latest: '已是当前频道最新版本', updateConfirm: '更新将备份数据库并重启服务，是否继续？', restarting: '已切换新版，服务正在重启。请稍后刷新。', dnsHint: 'DNS 修改会立即提交至服务商。Spaceship 当前版本支持域名同步和 DNS 查看。', content: '记录内容', recordName: '主机名（@ 为根域）', type: '记录类型', priority: '优先级', close: '关闭', auditHint: '最近 200 条管理操作记录，不包含密钥和密码。', date: '时间', target: '对象', action: '操作', importHint: '导入 JSON 数组，或包含 domains 数组的对象。每条记录需有 name 或 domain 字段；不导入旧账户密码与凭据。', readOnly: '只读模式', loginAgain: '资料已更新，请重新登录。' },
  en: { overview: 'Overview', domains: 'Domains', connections: 'Connections', accounts: 'Accounts', audit: 'Audit log', settings: 'Updates & settings', workspace: 'Domain workspace', greeting: 'Every domain. In its place.', subtitle: 'Manage your domains, DNS records and renewals in one place.', total: 'Total domains', connected: 'Connections', expiring: 'Expiring in 30 days', login: 'Sign in', username: 'Username', password: 'Password', welcome: 'Welcome back', loginHint: 'Sign in to your domain workspace.', bootstrap: 'First login: read initial-admin-password in the server data directory.', logout: 'Sign out', refresh: 'Refresh', add: 'Add', name: 'Name', provider: 'Provider', expiry: 'Expires', actions: 'Actions', empty: 'No data yet', start: 'Add a connection and sync your domains to get started.', sync: 'Sync domains', test: 'Test connection', remove: 'Delete', cancel: 'Cancel', save: 'Save', search: 'Search domains or connections…', role: 'Role', status: 'Status', admin: 'Administrator', viewer: 'Viewer', active: 'Active', disabled: 'Disabled', edit: 'Edit', currentPassword: 'Current password (required for your own account)', newPassword: 'New password (leave blank to keep)', notes: 'Notes', renew: 'Auto renew', yes: 'On', no: 'Off', unknown: 'Not provided', export: 'Export JSON', import: 'Import JSON', success: 'Done', confirmDelete: 'Delete this item? Domain removal is local only; DNS deletion affects live records.', connectionHint: 'Enable Porkbun API access. Cloudflare syncs DNS zones. Spaceship uses its official API key and secret. Credentials are encrypted and never returned.', accountHint: 'Editing your own account requires signing in again. At least one active administrator must remain.', updateHint: 'Check GitHub Releases for Node 3.x updates. The Linux systemd installer supports verified updates and database backups. Go installations are not overwritten.', check: 'Check for updates', apply: 'Update & restart', current: 'Current version', latest: 'Up to date on this channel', updateConfirm: 'Back up the database, update and restart now?', restarting: 'Version switched. Service is restarting; refresh shortly.', dnsHint: 'DNS writes are sent to the provider immediately. Spaceship DNS is read-only in this release.', content: 'Content', recordName: 'Record name (@ for root)', type: 'Type', priority: 'Priority', close: 'Close', auditHint: 'The latest 200 administrative events. Credentials are excluded.', date: 'Time', target: 'Target', action: 'Action', importHint: 'Import a JSON array or an object with a domains array. Each entry needs name or domain. Old passwords and credentials are not imported.', readOnly: 'Read only', loginAgain: 'Account updated. Please sign in again.' },
};
let language = localStorage.getItem('language') === 'en' ? 'en' : 'zh';
let theme = localStorage.getItem('theme') || 'light';
let token = sessionStorage.getItem('token') || '';
let user = null;
let currentPage = typeof URLSearchParams === 'function' ? new URLSearchParams(globalThis.location?.search || '').get('page') || 'overview' : 'overview';
let pageData;
let domains = [];
let accounts = [];
let providerCatalog = [];
let workflowData = {};
const extraWords = {
  zh: { register: '注册域名', transfer: '域名转入', finance: '支付与账单', orders: '订单记录', notifications: '通知提醒', roles: '角色权限', providers: '自定义服务商', dns: 'DNS 区域', lookup: '解析查询', manage: '域名管理', default: '设为默认', enabled: '启用', disabled: '停用', safety: '计费安全与联系人', billingEnabled: '允许注册 / 续费 / 转入扣款', registrarSync: '同步注册域名', contact: '创建 Spaceship 联系人', quote: '查询报价', years: '年限', authCode: '转移授权码', registrant: '注册人联系人 ID', autoRenew: '自动续费', purchase: '确认提交（会产生实际费用）', reconcile: '人工核对', syncOrders: '同步订单状态', syncPayments: '读取官方支付方式', invoices: '读取官方账单', balances: '读取账户余额', manual: '手工登记（仅记账）', channel: '通知渠道', run: '检查到期提醒', testAll: '测试所有启用渠道', thresholds: '提前提醒天数（逗号分隔）', notifyOnRenew: '提交续费后通知', enabledNotifications: '启用自动到期提醒', addChannel: '添加通知渠道', editRules: '提醒规则', logs: '发送日志', customRole: '附加角色', assignRoles: '分配附加角色', roleIds: '附加角色 ID（逗号分隔）', permissions: '权限码（逗号分隔）', manifest: '服务商声明 JSON', validate: '校验声明', addProvider: '导入服务商声明', defaultConnection: '默认接入', configuration: '配置 JSON（留空字段保留原值）', nameservers: '修改 NS', autorenew: '自动续费', transferLock: '转移锁', detail: '官方详情', renew: '续费', purge: '清除 Cloudflare 缓存', bookNote: '本地支付条目只用于记账，实际扣款使用注册商余额或其默认支付方式；不存储完整卡号和 CVV。', betaWarning: '提交前请核对域名、接入、金额和年限。超时或待核对订单请先核对服务商账单，勿创建新请求重复下单。', notes: '备注', editRecord: '编辑记录', privacy: '隐私级别', unpriced: '服务商无报价，允许按官方账户价格扣款', price: '价格', importLegacy: '旧数据迁移见部署文档；不在网页上传旧数据目录。' },
  en: { register: 'Register domains', transfer: 'Transfer domains', finance: 'Payments & billing', orders: 'Orders', notifications: 'Notifications', roles: 'Roles & permissions', providers: 'Custom providers', dns: 'DNS zones', lookup: 'DNS lookup', manage: 'Manage domain', default: 'Make default', enabled: 'Enabled', disabled: 'Disabled', safety: 'Billing safety & contacts', billingEnabled: 'Enable paid registration / renewal / transfer', registrarSync: 'Sync registrations', contact: 'Create Spaceship contact', quote: 'Get quotes', years: 'Years', authCode: 'Transfer authorization code', registrant: 'Registrant contact ID', autoRenew: 'Auto renewal', purchase: 'Confirm purchase (real charges)', reconcile: 'Reconcile', syncOrders: 'Sync order status', syncPayments: 'Read provider payment methods', invoices: 'Read provider invoices', balances: 'Read balances', manual: 'Manual bookkeeping', channel: 'Notification channel', run: 'Run expiry check', testAll: 'Test enabled channels', thresholds: 'Reminder thresholds (comma separated days)', notifyOnRenew: 'Notify on submitted renewal', enabledNotifications: 'Enable scheduled expiry reminders', addChannel: 'Add notification channel', editRules: 'Reminder rules', logs: 'Delivery log', customRole: 'Additional role', assignRoles: 'Assign additional roles', roleIds: 'Additional role IDs (comma separated)', permissions: 'Permission codes (comma separated)', manifest: 'Provider manifest JSON', validate: 'Validate manifest', addProvider: 'Import provider manifest', defaultConnection: 'Default connection', configuration: 'Configuration JSON (omitted values are retained)', nameservers: 'Change nameservers', autorenew: 'Auto renewal', transferLock: 'Transfer lock', detail: 'Provider details', renew: 'Renew', purge: 'Purge Cloudflare cache', bookNote: 'Local payment entries are bookkeeping only. Provider account balance or its default method is charged. Never store full card numbers or CVV.', betaWarning: 'Review domain, provider, price and term before submitting. Reconcile timed-out orders with the provider before making another request.', notes: 'Notes', editRecord: 'Edit record', privacy: 'Privacy level', unpriced: 'No quote: accept official account pricing', price: 'Price', importLegacy: 'Use the documented offline migration utility; do not upload old data directories in the browser.' },
};
for (const locale of ['zh', 'en']) Object.assign(words[locale], extraWords[locale]);
words.zh.dnsHint = 'DNS 修改会立即提交至服务商。Spaceship 支持新增和删除；修改时请新增替代记录后删除旧记录。';
words.en.dnsHint = 'DNS changes reach the provider immediately. Spaceship supports add/delete; create a replacement before deleting the original.';
Object.assign(words.zh, { all: '全部', '30days': '30 天内到期', expired: '已到期', sort: '排序', realName: '姓名', transferStatus: '查询转入状态', localEdit: '编辑资产备注', changePassword: '修改密码', renewalQuote: '查询续费报价' });
Object.assign(words.en, { all: 'All', '30days': 'Expires within 30 days', expired: 'Expired', sort: 'Sort', realName: 'Full name', transferStatus: 'Check transfer status', localEdit: 'Edit asset metadata', changePassword: 'Change password', renewalQuote: 'Get renewal quote' });
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
  const pagePermissions = { overview: 'domain:read', domains: 'domain:read', register: 'domain:read', transfer: 'transfer:read', connections: 'settings:read', dns: 'dns:read', lookup: 'dns:read', finance: 'payment:read', orders: 'payment:read', notifications: 'settings:read', roles: 'role:read', providers: 'settings:read', accounts: 'account:read', audit: 'audit:read', settings: 'settings:read' };
  const pages = Object.keys(pagePermissions).filter((page) => allowed(pagePermissions[page]));
  if (!pages.includes(currentPage)) currentPage = pages[0] || 'overview';
  const icons = { overview: '◈', domains: '◎', connections: '⇄', accounts: '♙', audit: '☷', settings: '⚙', register: '+', transfer: '⇥', dns: '⊕', lookup: '⌕', finance: '＄', orders: '≡', notifications: '♧', roles: '♙', providers: '◇' };
  const createPermission = { domains: 'domain:write', connections: 'settings:write', accounts: 'account:write' }[currentPage];
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brand-mark">D</span>DomainDeck</div>
      <nav aria-label="Navigation">${pages.map((page) => `<button class="nav-item ${page === currentPage ? 'active' : ''}" data-action="navigate" data-id="${page}"><span class="nav-icon">${icons[page]}</span>${translate(page)}</button>`).join('')}</nav>
      <div class="sidebar-foot"><strong>DomainDeck 3</strong><br>Node.js + SQLite<br>Porkbun · Cloudflare · Spaceship</div>
    </aside>
    <section class="workspace"><header class="topbar"><span class="muted">${translate('workspace')} / ${translate(currentPage)}</span>
      <div class="top-actions">${button('language', language === 'zh' ? 'EN' : '中文')}${button('theme', theme === 'light' ? '◐' : '☀')}<span class="avatar">${escape(user.username[0].toUpperCase())}</span><strong>${escape(user.username)}</strong>${button('self-password', 'newPassword')}${button('logout', 'logout')}</div>
    </header><main class="content"><div class="page-head"><div><div class="eyebrow">DOMAINDECK WORKSPACE</div><h1>${translate(currentPage)}</h1>
      <p>${translate(currentPage === 'overview' ? 'subtitle' : currentPage === 'connections' ? 'connectionHint' : currentPage === 'accounts' ? 'accountHint' : currentPage === 'audit' ? 'auditHint' : currentPage === 'settings' ? 'updateHint' : 'start')}</p></div>
      <div class="actions">${button('refresh', 'refresh')}${createPermission && allowed(createPermission) ? button('add', 'add', '', 'class="primary"') : ''}</div>
    </div><div id="page-content" class="loading">…</div></main></section></div>`;
}
const empty = () => `<div class="empty"><div class="empty-symbol">◎</div><strong>${translate('empty')}</strong><p>${translate('start')}</p></div>`;
function table(headers, rows) { return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map((heading) => `<th>${translate(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(); }
function domainTable(entries) { return table(['name', 'provider', 'expiry', 'autorenew', 'actions'], entries.map((item) => [`<strong>${escape(item.name)}</strong><small>${escape(item.notes || '')}</small>`, `<span class="badge">${escape(item.provider || 'Manual')}</span>`, escape(item.expires_at ? item.expires_at.slice(0, 10) : translate('unknown')), translate(item.auto_renew ? 'yes' : 'no'), `${item.connection_id && allowed('dns:read') ? button('dns', 'DNS', item.id) : ''} ${item.connection_id ? button('manage-domain', 'manage', item.id) : ''} ${allowed('domain:write') ? button('edit-local-domain', 'localEdit', item.id) + button('delete-domain', 'remove', item.id, 'class="danger"') : ''}`])); }

function filteredDomains() {
  const query = (document.querySelector('#search')?.value || '').toLowerCase();
  const expiry = document.querySelector('[name="expiry-filter"]')?.value || 'all';
  const renew = document.querySelector('[name="renew-filter"]')?.value || 'all';
  const sort = document.querySelector('[name="domain-sort"]')?.value || 'name';
  return domains.filter((item) => {
    const remaining = Date.parse(item.expires_at) - Date.now();
    return `${item.name} ${item.provider} ${item.connection_name} ${item.notes}`.toLowerCase().includes(query) && (expiry === 'all' || expiry === 'expired' && remaining < 0 || expiry === '30days' && remaining >= 0 && remaining < 30 * 86400000) && (renew === 'all' || Boolean(item.auto_renew) === (renew === 'yes'));
  }).sort((first, second) => sort === 'expiry' ? (Date.parse(first.expires_at) || Infinity) - (Date.parse(second.expires_at) || Infinity) : first.name.localeCompare(second.name));
}

function filterDomains() { document.querySelector('#domain-table').innerHTML = domainTable(filteredDomains()); }

function rememberPage() {
  if (!globalThis.location || !globalThis.history) return;
  const url = new URL(location.href);
  url.searchParams.set('page', currentPage);
  if (currentPage === 'domains') for (const [key, selector] of Object.entries({ search: '#search', expiry: '[name="expiry-filter"]', renew: '[name="renew-filter"]', sort: '[name="domain-sort"]' })) {
    const value = document.querySelector(selector)?.value;
    if (value) url.searchParams.set(key, value.slice(0, 300));
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

function restoreDomainFilters() {
  if (!globalThis.location) return;
  const parameters = new URLSearchParams(location.search);
  for (const [key, selector] of Object.entries({ search: '#search', expiry: '[name="expiry-filter"]', renew: '[name="renew-filter"]', sort: '[name="domain-sort"]' })) {
    const input = document.querySelector(selector);
    if (input && parameters.has(key)) input.value = parameters.get(key).slice(0, 300);
  }
  if (document.querySelector('#domain-table')) filterDomains();
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
async function loadPage() {
  const revision = ++generation;
  shell();
  try {
    if (await workflowPage(revision)) return;
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
      content.innerHTML = `<section class="card"><div class="section-heading"><input id="search" class="search" aria-label="${translate('search')}" placeholder="${translate('search')}"><div class="actions">${select('expiry-filter', 'expiry', ['all', '30days', 'expired'], 'all')}${select('renew-filter', 'autorenew', ['all', 'yes', 'no'], 'all')}${select('domain-sort', 'sort', ['name', 'expiry'], 'name')}${button('export', 'export')}${button('export-csv', 'CSV')}${allowed('domain:write') ? button('import', 'import') : ''}</div></div><div id="domain-table">${domainTable(data)}</div></section>`;
      restoreDomainFilters();
    } else if (currentPage === 'connections') {
      providerCatalog = await api('/providers') || [];
      if (revision !== generation) return;
      workflowData.connections = data;
      content.innerHTML = `<div class="notice">${translate('connectionHint')}</div><div class="connection-grid">${data.length ? data.map((item) => `<section class="card"><span class="badge">${escape(item.provider.toUpperCase())}</span><h2>${escape(item.name)}</h2><p class="muted">${escape(item.created_at.slice(0, 10))} · ${translate(item.enabled === false ? 'disabled' : 'enabled')} ${item.isDefault ? '★' : ''}</p><div class="actions">${allowed('settings:write') ? button('sync', 'sync', item.id, 'class="primary"') + button('test', 'test', item.id) + button('edit-connection', 'edit', item.id) + button('default-connection', 'default', item.id) + (item.provider === 'cloudflare' ? button('registrar-sync', 'registrarSync', item.id) : '') + button('delete-connection', 'remove', item.id, 'class="danger"') : ''}</div></section>`).join('') : empty()}</div>`;
    } else if (currentPage === 'accounts') {
      accounts = data;
      content.innerHTML = `<section class="card">${table(['username', 'role', 'status', 'actions'], data.map((account) => [`<strong>${escape(account.username)}</strong>`, `<span class="badge">${translate(account.role)}</span>`, translate(account.status), allowed('account:write') ? button('edit-account', 'edit', account.id) + (user.role === 'admin' ? button('assign-roles', 'assignRoles', account.id) : '') + (account.id !== user.userId ? button('delete-account', 'remove', account.id, 'class="danger"') : '') : '—']))}</section>`;
    } else if (currentPage === 'audit') {
      content.innerHTML = `<section class="card">${table(['date', 'username', 'action', 'target'], data.map((item) => [escape(item.created_at.replace('T', ' ').slice(0, 19)), escape(item.username), escape(item.action), escape(item.target)]))}</section>`;
    } else {
      const settings = await api('/settings');
      if (revision !== generation) return;
      workflowData.settings = settings;
      content.innerHTML = `<section class="card"><div class="section-heading"><h2>${translate('current')}: ${escape(data.version)}</h2><span class="badge">Node.js + SQLite</span></div><p class="muted">${translate('updateHint')}</p><div class="actions">${allowed('settings:write') ? button('check-update', 'check', '', 'class="primary"') + button('safety-settings', 'safety') + button('create-contact', 'contact') : ''}<span id="update-result" role="status"></span></div><p class="muted">${translate('billingEnabled')}: ${translate(settings.safety.billingEnabled ? 'yes' : 'no')}</p><p class="muted">${translate('importLegacy')}</p></section>`;
    }
  } catch (error) { if (revision === generation && user) { document.querySelector('#page-content').textContent = error.message; notice(error.message); } }
}
function modal(title, content, kind) {
  document.querySelector('#dialog-body').innerHTML = `<h2>${escape(translate(title))}</h2><form id="modal-form" data-kind="${kind}">${content}<div class="error" role="alert"></div><div class="actions">${button('close', 'cancel', '', 'type="button"')}<button class="primary" type="submit">${translate('save')}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}
function addForm() {
  if (currentPage === 'connections') { modal('connections', field('name', 'name') + select('provider', 'provider', providerCatalog.length ? providerCatalog.map((item) => item.id) : ['porkbun', 'cloudflare', 'spaceship', 'godaddy', 'namecheap'], 'porkbun') + '<div id="credential-fields"></div>', 'connection'); credentialFields(); }
  if (currentPage === 'domains') modal('domains', field('name', 'name') + field('expiresAt', 'expiry', '', 'date', false) + field('notes', 'notes', '', 'text', false), 'domain');
  if (currentPage === 'accounts') modal('accounts', field('username', 'username') + field('realName', 'realName', '', 'text', false) + field('email', 'Email', '', 'email', false) + field('password', 'password', '', 'password') + select('role', 'role', ['viewer', 'admin'], 'viewer') + select('status', 'status', ['active', 'disabled'], 'active'), 'account');
}
function credentialFields() {
  const provider = document.querySelector('[name="provider"]').value;
  const catalog = providerCatalog.find((item) => item.id === provider);
  const fields = catalog?.fields || (provider === 'cloudflare' ? ['token', 'accountId'] : ['apiKey', provider === 'porkbun' ? 'secretKey' : 'apiSecret']);
  document.querySelector('#credential-fields').innerHTML = fields.map((item) => typeof item === 'string' ? field(item, item, '', 'password', !document.querySelector('#modal-form').dataset.id) : field(item.key, item.label, '', item.secret ? 'password' : 'text', !document.querySelector('#modal-form').dataset.id && item.required !== false)).join('');
}
async function showDns(id) {
  const domain = domains.find((item) => item.id === id);
  if (!domain) return;
  const records = await api(`/domains/${id}/dns`);
  const canWrite = allowed('dns:write');
  workflowData.records = records;
  workflowData.recordDomain = domain;
  document.querySelector('#dialog-body').innerHTML = `<h2>DNS · ${escape(domain.name)}</h2><p class="muted">${translate('dnsHint')}</p>${table(['type', 'name', 'content', 'actions'], records.map((record) => [escape(record.type), escape(record.name), escape(record.content), canWrite ? (domain.provider !== 'spaceship' ? button('edit-record', 'editRecord', record.id, 'type="button"') : '') + button('delete-record', 'remove', `${id}:${record.id}`, 'type="button" class="danger"') : '—']))}${canWrite ? `<form id="modal-form" data-kind="dns" data-domain="${id}">${recordFields()}<div class="error" role="alert"></div><button class="primary">${translate('add')}</button></form>` : ''}<div class="actions">${button('close', 'close', '', 'type="button"')}</div>`;
  if (!dialog.open) dialog.showModal();
}
document.addEventListener('input', (event) => { if (event.target.id === 'search') { filterDomains(); rememberPage(); } });
document.addEventListener('change', (event) => { if (event.target.name === 'provider') credentialFields(); if (['expiry-filter', 'renew-filter', 'domain-sort'].includes(event.target.name)) { filterDomains(); rememberPage(); } });
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  target.disabled = true;
  try {
    if (await workflowAction(action, id)) return;
    if (action === 'language') { language = language === 'zh' ? 'en' : 'zh'; localStorage.setItem('language', language); if (user) await loadPage(); else renderLogin(); }
    else if (action === 'theme') { theme = theme === 'light' ? 'dark' : 'light'; localStorage.setItem('theme', theme); setTheme(); }
    else if (action === 'logout') { await api('/auth/logout', 'POST'); signOut(); }
    else if (action === 'navigate') { currentPage = id; await loadPage(); rememberPage(); }
    else if (action === 'refresh') await loadPage();
    else if (action === 'close') dialog.close();
    else if (action === 'add') addForm();
    else if (action === 'sync' || action === 'test') { const result = await api(`/connections/${id}/${action}`, 'POST'); notice(`${translate('success')}${result.domains !== undefined ? ` · ${result.domains}` : ''}`); await loadPage(); }
    else if (action === 'delete-domain' || action === 'delete-connection') { if (confirm(translate('confirmDelete'))) { await api(`/${action === 'delete-domain' ? 'domains' : 'connections'}/${id}`, 'DELETE'); await loadPage(); } }
    else if (action === 'edit-account') {
      const account = accounts.find((item) => item.id === id);
      modal('accounts', field('username', 'username', account.username) + field('realName', 'realName', account.realName || '', 'text', false) + field('email', 'Email', account.email || '', 'email', false) + field('password', 'newPassword', '', 'password', false) + (id === user.userId ? field('currentPassword', 'currentPassword', '', 'password') : '') + select('role', 'role', ['admin', 'viewer'], account.role) + select('status', 'status', ['active', 'disabled'], account.status), 'account-edit');
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
    if (await workflowSubmit(kind, values, form)) return;
    if (kind === 'connection') await api('/connections', 'POST', { name: values.name, provider: values.provider, credentials: values });
    else if (kind === 'domain') await api('/domains', 'POST', values);
    else if (kind === 'account') await api('/accounts', 'POST', values);
    else if (kind === 'account-edit') { const result = await api(`/accounts/${form.dataset.id}`, 'PATCH', values); if (result.loginRequired) { signOut(); notice(translate('loginAgain')); return; } }
    else if (kind === 'import') { const parsed = JSON.parse(values.json); await api('/domains/import', 'POST', { domains: Array.isArray(parsed) ? parsed : parsed.domains }); }
    else if (kind === 'dns') { await api(`/domains/${form.dataset.domain}/dns`, 'POST', { ...values, proxied: values.proxied === 'on' }); await showDns(form.dataset.domain); notice(translate('success')); return; }
    dialog.close(); notice(translate('success')); await loadPage();
  } catch (error) { const output = form.querySelector('.error'); if (output) output.textContent = error.message; else notice(error.message); } finally { submit.disabled = false; }
});
setTheme();
if (token) { try { user = await api('/user/info'); await loadPage(); } catch { signOut(); } } else renderLogin();

function allowed(permission) {
  if (!user) return false;
  return user.role === 'admin' || (user.permissions || ['domain:read', 'dns:read', 'transfer:read']).includes(permission);
}

function jsonField(name, label, value = {}) {
  return `<label>${escape(translate(label))}<textarea name="${name}" spellcheck="false" required>${escape(JSON.stringify(value, null, 2))}</textarea></label>`;
}

function checkbox(name, label, checked = false) {
  return `<label class="checkbox"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>${escape(translate(label))}</label>`;
}

function recordFields(record = {}) {
  return `<div class="field-pair">${select('type', 'type', ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'], record.type || 'A')}${field('name', 'recordName', record.name || '@')}</div>${field('content', 'content', record.content || '')}<div class="field-pair">${field('ttl', 'TTL', record.ttl || 600, 'number')}${field('priority', 'priority', record.priority || 0, 'number')}</div><div class="field-pair">${field('weight', 'SRV weight', record.weight || 0, 'number', false)}${field('port', 'SRV port', record.port || 0, 'number', false)}</div>${checkbox('proxied', 'Cloudflare proxy', record.proxied === true)}`;
}

function showResult(title, result) {
  document.querySelector('#dialog-body').innerHTML = `<h2>${escape(translate(title))}</h2><pre>${escape(JSON.stringify(result, null, 2))}</pre><div class="actions">${button('close', 'close', '', 'type="button"')}</div>`;
  if (!dialog.open) dialog.showModal();
}

async function workflowPage(revision) {
  if (!['register', 'transfer', 'finance', 'orders', 'notifications', 'roles', 'providers', 'dns', 'lookup'].includes(currentPage)) return false;
  let html = '';
  if (currentPage === 'register' || currentPage === 'transfer') {
    const connections = await api('/registrars');
    workflowData.connections = connections;
    html = `<section class="card"><p class="notice">${translate('betaWarning')}</p><form id="workflow-form" data-kind="quotes">${field('domain', 'name', '')}${currentPage === 'register' ? field('years', 'years', 1, 'number') : ''}<button class="primary" type="submit">${translate('quote')}</button></form><div id="quote-results"></div></section>${currentPage === 'transfer' ? `<section class="card"><form id="transfer-form" data-kind="transfer-status">${field('domain', 'name')}<label>${translate('connections')}<select name="connectionId">${connections.map((bound) => `<option value="${escape(bound.id)}">${escape(bound.name)}</option>`).join('')}</select></label><button class="primary" type="submit">${translate('transferStatus')}</button></form><pre id="transfer-result"></pre></section>` : ''}`;
  } else if (currentPage === 'orders') {
    const orders = await api('/orders');
    workflowData.orders = orders;
    html = `<section class="card"><div class="actions">${allowed('payment:write') ? button('sync-orders', 'syncOrders') : ''}</div>${table(['date', 'name', 'type', 'status', 'price', 'actions'], orders.map((order) => [escape(order.created_at.slice(0, 19)), escape(order.domain), escape(order.kind), escape(order.status), escape(order.details.price ? `${order.details.price.amount} ${order.details.price.currency}` : '—'), button('order-detail', 'detail', order.id) + (allowed('payment:write') ? button('reconcile-order', 'reconcile', order.id) : '')]))}</section>`;
  } else if (currentPage === 'finance') {
    const payments = await api('/payments');
    workflowData.payments = payments;
    html = `<section class="card"><p class="notice">${translate('bookNote')}</p><div class="actions">${allowed('payment:write') ? button('add-payment', 'manual') + button('sync-payments', 'syncPayments') : ''}${button('read-invoices', 'invoices')}${button('read-balances', 'balances')}</div>${table(['name', 'type', 'content', 'actions'], payments.map((payment) => [escape(payment.name) + (payment.isDefault ? ' ★' : ''), escape(payment.type), escape(payment.last4 || ''), allowed('payment:write') ? button('edit-payment', 'edit', payment.id) + button('default-payment', 'default', payment.id) + button('delete-payment', 'remove', payment.id, 'class="danger"') : '—']))}</section>`;
  } else if (currentPage === 'notifications') {
    const config = await api('/notifications');
    workflowData.notificationConfig = config;
    html = `<section class="card"><div class="actions">${allowed('settings:write') ? button('edit-rules', 'editRules') + button('add-channel', 'addChannel') + button('test-channels', 'testAll') + button('run-notifications', 'run') : ''}${button('notification-log', 'logs')}</div><p class="muted">${translate('enabledNotifications')}: ${translate(config.enabled ? 'yes' : 'no')} · ${config.expiryDays.join(', ')}</p>${table(['name', 'type', 'status', 'actions'], config.channels.map((channel) => [escape(channel.name), escape(channel.type), translate(channel.enabled ? 'enabled' : 'disabled'), allowed('settings:write') ? button('edit-channel', 'edit', channel.id) + button('test-channel', 'test', channel.id) + button('delete-channel', 'remove', channel.id, 'class="danger"') : '—']))}</section>`;
  } else if (currentPage === 'roles') {
    const roles = await api('/roles');
    workflowData.roles = roles;
    html = `<section class="card"><div class="actions">${allowed('role:write') ? button('add-role', 'add') : ''}</div>${table(['name', 'permissions', 'actions'], roles.map((role) => [escape(role.name), `<small>${escape(role.permissions.join(', '))}</small>`, !role.builtin && allowed('role:write') ? button('edit-role', 'edit', role.id) + button('delete-role', 'remove', role.id, 'class="danger"') : '—']))}</section>`;
  } else if (currentPage === 'providers') {
    const providers = await api('/providers');
    workflowData.providers = providers;
    html = `<section class="card"><p class="notice">HTTPS JSON / XML · No scripts · Public endpoints only</p><div class="actions">${allowed('settings:write') ? button('add-provider', 'addProvider') : ''}</div>${table(['name', 'provider', 'actions'], providers.map((provider) => [escape(provider.name), escape(provider.id), !provider.builtin ? button('provider-detail', 'detail', provider.id) + (allowed('settings:write') ? button('delete-provider', 'remove', provider.id, 'class="danger"') : '') : '—']))}</section>`;
  } else if (currentPage === 'dns') {
    const zones = await api('/dns/zones');
    workflowData.zones = zones.items;
    html = `<section class="card">${zones.notes.length ? `<p class="notice">${escape(JSON.stringify(zones.notes))}</p>` : ''}${table(['name', 'provider', 'actions'], zones.items.map((zone) => [escape(zone.name), escape(zone.connectionName), button('zone-records', 'DNS', zone.id)]))}</section>`;
  } else {
    html = `<section class="card"><form id="workflow-form" data-kind="lookup"><div class="field-pair">${field('domain', 'name')}${select('type', 'type', ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA'], 'A')}</div><button class="primary">${translate('lookup')}</button></form><pre id="lookup-results"></pre></section>`;
  }
  if (revision !== generation || !user) return true;
  const content = document.querySelector('#page-content');
  content.className = '';
  content.innerHTML = html;
  return true;
}

async function purchaseForm(kind, name, connectionId, price, domainId = '', years = 1) {
  workflowData.purchase = { kind, domain: name, connectionId, price, domainId, years, requestId: crypto.randomUUID() };
  modal(kind, `<p class="notice">${translate('betaWarning')}</p><p><strong>${escape(name)}</strong> · ${escape(price ? `${price.amount} ${price.currency}` : translate('unpriced'))} · ${translate('years')}: ${years}</p>${kind === 'transfer' ? field('authCode', 'authCode', '', 'password') : ''}${kind !== 'renew' ? field('registrant', 'registrant', workflowData.settings?.contacts?.registrant || '', 'text', false) + checkbox('autoRenew', 'autoRenew') : ''}${!price ? checkbox('acceptUnpriced', 'unpriced') : ''}`, 'purchase');
}

async function workflowAction(action, id) {
  if (action === 'manage-domain') {
    const domain = domains.find((item) => item.id === id);
    workflowData.managed = domain;
    const actions = [button('domain-detail', 'detail'), ...(allowed('domain:billing') ? [button('renew-domain', 'renew')] : []), ...(allowed('domain:write') ? [button('domain-autorenew', 'autorenew'), button('domain-nameservers', 'nameservers')] : []), ...(allowed('transfer:write') ? [button('domain-auth-code', 'authCode'), button('domain-lock', 'transferLock')] : []), ...(domain.provider === 'cloudflare' && allowed('dns:write') ? [button('domain-purge', 'purge')] : [])];
    document.querySelector('#dialog-body').innerHTML = `<h2>${escape(domain.name)}</h2><div class="actions">${actions.join('')}${button('close', 'close')}</div>`;
    dialog.showModal();
  } else if (action === 'edit-local-domain') {
    const domain = domains.find((item) => item.id === id);
    modal('localEdit', field('expiresAt', 'expiry', domain.expires_at.slice(0, 10), 'date', false) + field('notes', 'notes', domain.notes || '', 'text', false), 'local-domain');
    document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'self-password') {
    modal('changePassword', field('currentPassword', 'currentPassword', '', 'password') + field('password', 'newPassword', '', 'password'), 'self-password');
  } else if (action === 'export-csv') {
    const rows = [['Domain', 'Provider', 'Connection', 'Expiry', 'Auto renew', 'Notes'], ...filteredDomains().map((item) => [item.name, item.provider, item.connection_name, item.expires_at, Boolean(item.auto_renew), item.notes])];
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'domaindeck-domains.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (action === 'domain-detail' || action === 'domain-auth-code') {
    const domain = workflowData.managed;
    showResult(action === 'domain-detail' ? 'detail' : 'authCode', await api(`/domains/${domain.id}/${action === 'domain-detail' ? 'details' : 'auth-code'}`));
  } else if (action === 'domain-autorenew' || action === 'domain-lock') {
    dialog.close();
    modal(action === 'domain-lock' ? 'transferLock' : 'autorenew', select('value', 'status', ['yes', 'no'], workflowData.managed.auto_renew ? 'yes' : 'no'), action);
  } else if (action === 'domain-nameservers') {
    dialog.close(); modal('nameservers', field('hosts', 'nameservers', '', 'text'), action);
  } else if (action === 'domain-purge') {
    if (confirm(translate('purge') + '?')) { await api(`/domains/${workflowData.managed.id}/purge`, 'POST'); notice(translate('success')); }
  } else if (action === 'renew-domain') {
    modal('renew', field('years', 'years', 1, 'number'), 'renewal-quote');
  } else if (action === 'purchase-quote') {
    const quote = workflowData.quotes.quotes.find((item) => item.connectionId === id);
    await purchaseForm(currentPage === 'transfer' ? 'transfer' : 'register', workflowData.quotes.domain, id, quote.prices?.[currentPage === 'transfer' ? 'transfer' : 'register'], '', currentPage === 'transfer' ? 1 : workflowData.quotes.years);
  } else if (action === 'edit-connection') {
    const bound = workflowData.connections.find((item) => item.id === id);
    modal('connections', field('name', 'name', bound.name) + select('provider', 'provider', [bound.provider], bound.provider) + checkbox('enabled', 'enabled', bound.enabled) + checkbox('isDefault', 'defaultConnection', bound.isDefault) + '<div id="credential-fields"></div>', 'connection-edit');
    document.querySelector('#modal-form').dataset.id = id; credentialFields();
  } else if (action === 'default-connection' || action === 'registrar-sync') {
    const result = await api(`/connections/${id}/${action === 'default-connection' ? 'default' : 'registrations'}`, 'POST');
    notice(translate('success')); if (action === 'registrar-sync') showResult('registrarSync', result); else await loadPage();
  } else if (action === 'edit-record') {
    const record = workflowData.records.find((entry) => String(entry.id) === id);
    dialog.close(); modal('editRecord', recordFields(record), 'dns-edit');
    document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'zone-records') {
    const records = await api(`/dns/zones/${encodeURIComponent(id)}/records`);
    workflowData.zoneId = id;
    workflowData.zoneRecords = records;
    const zone = workflowData.zones.find((entry) => entry.id === id);
    document.querySelector('#dialog-body').innerHTML = `<h2>DNS · ${escape(zone.name)}</h2><p class="muted">${translate('dnsHint')}</p>${table(['type', 'name', 'content', 'actions'], records.map((record) => [escape(record.type), escape(record.name), escape(record.content), allowed('dns:write') ? (zone.provider !== 'spaceship' ? button('zone-edit', 'edit', String(record.id)) : '') + button('zone-delete', 'remove', String(record.id)) : '—']))}${allowed('dns:write') ? `<form id="modal-form" data-kind="zone-dns">${recordFields()}<div class="error" role="alert"></div><button class="primary">${translate('add')}</button></form>` : ''}${zone.provider === 'cloudflare' && allowed('dns:write') ? button('zone-purge', 'purge') : ''}${button('close', 'close')}`;
    if (!dialog.open) dialog.showModal();
  } else if (action === 'zone-edit') {
    const record = workflowData.zoneRecords.find((entry) => String(entry.id) === id);
    modal('editRecord', recordFields(record), 'zone-edit');
    document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'zone-purge') {
    if (confirm(translate('purge') + '?')) { await api(`/dns/zones/${encodeURIComponent(workflowData.zoneId)}/purge`, 'POST'); notice(translate('success')); }
  } else if (action === 'zone-delete') {
    if (confirm(translate('confirmDelete'))) { await api(`/dns/zones/${encodeURIComponent(workflowData.zoneId)}/records/${id}`, 'DELETE'); await workflowAction('zone-records', workflowData.zoneId); }
  } else if (action === 'safety-settings') {
    const config = workflowData.settings;
    modal('safety', checkbox('billingEnabled', 'billingEnabled', config.safety.billingEnabled) + ['registrant', 'admin', 'tech', 'billing'].map((name) => field(name, `${name} contact ID`, config.contacts[name] || '', 'text', false)).join(''), 'safety');
  } else if (action === 'create-contact') {
    const connections = (await api('/connections')).filter((item) => item.provider === 'spaceship');
    modal('contact', select('connectionId', 'connections', connections.map((item) => item.id), connections[0]?.id) + jsonField('contact', 'configuration', { firstName: '', lastName: '', email: '', address1: '', city: '', country: '', stateProvince: '', postalCode: '', phone: '' }), 'contact');
  } else if (action === 'add-role' || action === 'edit-role') {
    const role = workflowData.roles?.find((item) => item.id === id);
    const permissions = await api('/permissions');
    modal('roles', field('name', 'name', role?.name || '') + field('permissions', 'permissions', role?.permissions.join(', ') || '') + `<small>${escape(permissions.join(', '))}</small>`, 'role');
    if (role) document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'assign-roles') {
    const roles = await api('/roles');
    const assigned = await api(`/accounts/${id}/roles`);
    modal('assignRoles', field('roleIds', 'roleIds', assigned.join(', '), 'text', false) + `<pre>${escape(JSON.stringify(roles.filter((role) => !role.builtin).map((role) => ({ id: role.id, name: role.name })), null, 2))}</pre>`, 'assign-roles');
    document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'delete-role' || action === 'delete-account' || action === 'delete-provider' || action === 'delete-payment') {
    const routes = { 'delete-role': 'roles', 'delete-account': 'accounts', 'delete-provider': 'providers/custom', 'delete-payment': 'payments' };
    if (confirm(translate('confirmDelete'))) { await api(`/${routes[action]}/${id}`, 'DELETE'); await loadPage(); }
  } else if (action === 'add-provider') {
    modal('providers', jsonField('manifest', 'manifest', { id: 'myregistrar', name: 'My registrar', fields: [{ key: 'apiKey', label: 'API Key', required: true, secret: true }], request: { baseUrl: 'https://api.example.com', auth: { type: 'header', map: { Authorization: 'Bearer {apiKey}' } } }, ops: { test: { path: '/account' }, listDomains: { path: '/domains', itemsPath: 'items', map: { name: 'name', expirationDate: 'expiresAt' } } } }), 'provider');
  } else if (action === 'provider-detail') showResult('providers', await api(`/providers/custom/${id}`));
  else if (action === 'add-payment' || action === 'edit-payment') {
    const payment = workflowData.payments.find((item) => item.id === id);
    modal('finance', `<p class="notice">${translate('bookNote')}</p>` + field('name', 'name', payment?.name || '') + select('type', 'type', ['card', 'paypal', 'alipay', 'wechat', 'balance', 'bank', 'crypto', 'other'], payment?.type || 'card') + field('last4', 'Last 4 / account reference', payment?.last4 || '', 'text', false) + field('holder', 'Holder', payment?.holder || '', 'text', false) + field('expiry', 'expiry', payment?.expiry || '', 'month', false) + field('notes', 'notes', payment?.notes || '', 'text', false), 'payment');
    if (payment) document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'default-payment') { await api(`/payments/${id}/default`, 'POST'); await loadPage(); }
  else if (action === 'sync-payments' || action === 'read-invoices' || action === 'read-balances') {
    const endpoint = { 'sync-payments': '/payments/sync', 'read-invoices': '/invoices', 'read-balances': '/accounts/balances' }[action];
    showResult('finance', await api(endpoint, action === 'sync-payments' ? 'POST' : 'GET'));
  } else if (action === 'sync-orders') { await api('/orders/sync', 'POST'); await loadPage(); }
  else if (action === 'order-detail') showResult('orders', workflowData.orders.find((item) => item.id === id));
  else if (action === 'reconcile-order') {
    const order = workflowData.orders.find((item) => item.id === id);
    modal('reconcile', `<p>${escape(order.domain)}</p>` + select('status', 'status', ['completed', 'failed', 'needs-review', 'cancelled'], order.status) + field('note', 'notes', '', 'text', false), 'order');
    document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'edit-rules') {
    const config = workflowData.notificationConfig;
    modal('editRules', checkbox('enabled', 'enabledNotifications', config.enabled) + field('expiryDays', 'thresholds', config.expiryDays.join(', ')) + checkbox('notifyOnRenew', 'notifyOnRenew', config.notifyOnRenew), 'notification-rules');
  } else if (action === 'add-channel' || action === 'edit-channel') {
    const config = workflowData.notificationConfig;
    const channel = config.channels.find((item) => item.id === id);
    const examples = { email: { host: '', port: '465', user: '', pass: '', from: '', to: '' }, webhook: { url: 'https://example.com/hooks/domain', headers: '{}' }, telegram: { botToken: '', chatId: '' }, wecom: { webhook: '' }, feishu: { webhook: '' }, dingtalk: { webhook: '', secret: '' }, bark: { server: 'https://api.day.app', deviceKey: '', group: 'DomainDeck' } };
    modal('channel', field('name', 'name', channel?.name || '') + select('channelType', 'type', config.channelTypes, channel?.type || 'webhook') + checkbox('enabled', 'enabled', channel?.enabled !== false) + jsonField('configuration', 'configuration', channel ? {} : examples.webhook) + `<pre>${escape(JSON.stringify(config.channelFields, null, 2))}</pre>`, 'notification-channel');
    if (channel) document.querySelector('#modal-form').dataset.id = id;
  } else if (action === 'delete-channel') {
    if (confirm(translate('confirmDelete'))) { const config = workflowData.notificationConfig; await api('/notifications', 'PUT', { ...config, channels: config.channels.filter((item) => item.id !== id) }); await loadPage(); }
  } else if (['test-channels', 'test-channel', 'run-notifications', 'notification-log'].includes(action)) {
    const endpoint = action === 'run-notifications' ? 'run' : action === 'notification-log' ? 'log' : 'test';
    showResult('notifications', await api(`/notifications/${endpoint}`, endpoint === 'log' ? 'GET' : 'POST', action === 'test-channel' ? { channelId: id } : undefined));
  } else return false;
  return true;
}

async function workflowSubmit(kind, values, form) {
  if (kind === 'transfer-status') {
    document.querySelector('#transfer-result').textContent = JSON.stringify(await api(`/transfer/${encodeURIComponent(values.domain)}?connectionId=${encodeURIComponent(values.connectionId)}`), null, 2);
    return true;
  }
  if (kind === 'self-password') {
    await api('/auth/change-password', 'POST', values); signOut(); notice(translate('loginAgain')); return true;
  }
  if (kind === 'renewal-quote') {
    const domain = workflowData.managed;
    const result = await api(`/availability?domain=${encodeURIComponent(domain.name)}&connectionId=${domain.connection_id}&years=${Number(values.years)}`);
    const quote = result.quotes.find((item) => item.connectionId === domain.connection_id);
    if (quote?.error) throw new Error(quote.error);
    await purchaseForm('renew', domain.name, domain.connection_id, quote?.prices?.renew, domain.id, result.years);
    return true;
  }
  if (kind === 'quotes') {
    const result = await api(`/availability?domain=${encodeURIComponent(values.domain)}&years=${currentPage === 'transfer' ? 1 : Number(values.years || 1)}`);
    workflowData.quotes = result;
    document.querySelector('#quote-results').innerHTML = table(['provider', 'price', 'status', 'actions'], result.quotes.map((quote) => {
      const price = quote.prices?.[currentPage === 'transfer' ? 'transfer' : 'register'];
      return [escape(quote.connectionName), escape(price ? `${price.amount} ${price.currency}` : '—'), escape(quote.error || JSON.stringify(quote.availability)), !quote.error && quote.supports?.[currentPage === 'transfer' ? 'transfer' : 'register'] && allowed(currentPage === 'transfer' ? 'transfer:write' : 'domain:billing') ? button('purchase-quote', 'purchase', quote.connectionId, 'type="button"') : '—'];
    }));
    return true;
  }
  if (kind === 'lookup') {
    const result = await api(`/lookup?domain=${encodeURIComponent(values.domain)}&type=${values.type}`);
    document.querySelector('#lookup-results').textContent = JSON.stringify(result, null, 2); return true;
  }
  if (kind === 'purchase') {
    if (!confirm(translate('betaWarning'))) return true;
    const purchase = workflowData.purchase;
    const body = { domain: purchase.domain, connectionId: purchase.connectionId, requestId: purchase.requestId, years: purchase.years, expectedPrice: purchase.price, acceptUnpriced: values.acceptUnpriced === 'on', confirm: true, autoRenew: values.autoRenew === 'on', contacts: values.registrant ? { registrant: values.registrant } : undefined, authCode: values.authCode };
    const result = await api(purchase.kind === 'renew' ? `/domains/${purchase.domainId}/renew` : `/${purchase.kind}`, 'POST', body);
    dialog.close(); showResult('orders', result); return true;
  }
  if (kind === 'local-domain') await api(`/domains/${form.dataset.id}`, 'PATCH', values);
  else if (kind === 'connection-edit') {
    const credentials = Object.fromEntries(Object.entries(values).filter(([name, value]) => !['name', 'provider', 'enabled', 'isDefault'].includes(name) && value));
    await api(`/connections/${form.dataset.id}`, 'PUT', { name: values.name, credentials, enabled: values.enabled === 'on', isDefault: values.isDefault === 'on' });
  } else if (kind === 'safety') await api('/settings', 'PUT', { safety: { billingEnabled: values.billingEnabled === 'on' }, contacts: Object.fromEntries(['registrant', 'admin', 'tech', 'billing'].map((name) => [name, values[name]])) });
  else if (kind === 'contact') { const result = await api('/contacts', 'POST', { connectionId: values.connectionId, contact: JSON.parse(values.contact) }); dialog.close(); showResult('contact', result); return true; }
  else if (kind === 'role') await api(form.dataset.id ? `/roles/${form.dataset.id}` : '/roles', form.dataset.id ? 'PUT' : 'POST', { name: values.name, permissions: values.permissions.split(',').map((value) => value.trim()).filter(Boolean) });
  else if (kind === 'assign-roles') await api(`/accounts/${form.dataset.id}/roles`, 'PUT', { roleIds: values.roleIds.split(',').map((value) => value.trim()).filter(Boolean) });
  else if (kind === 'provider') {
    const manifest = JSON.parse(values.manifest);
    await api('/providers/custom/validate', 'POST', { manifest });
    await api('/providers/custom', 'POST', { manifest });
  } else if (kind === 'payment') await api(form.dataset.id ? `/payments/${form.dataset.id}` : '/payments', form.dataset.id ? 'PUT' : 'POST', values);
  else if (kind === 'order') await api(`/orders/${form.dataset.id}`, 'PUT', values);
  else if (kind === 'notification-rules') await api('/notifications', 'PUT', { enabled: values.enabled === 'on', expiryDays: values.expiryDays.split(',').map((value) => Number(value.trim())), notifyOnRenew: values.notifyOnRenew === 'on' });
  else if (kind === 'notification-channel') {
    const config = workflowData.notificationConfig;
    const candidate = { id: form.dataset.id, name: values.name, type: values.channelType, enabled: values.enabled === 'on', config: JSON.parse(values.configuration) };
    await api('/notifications', 'PUT', { ...config, channels: [...config.channels.filter((item) => item.id !== candidate.id), candidate] });
  } else if (kind === 'domain-autorenew' || kind === 'domain-lock') await api(`/domains/${workflowData.managed.id}/${kind === 'domain-lock' ? 'transfer-lock' : 'autorenew'}`, 'PUT', kind === 'domain-lock' ? { isLocked: values.value === 'yes' } : { isEnabled: values.value === 'yes' });
  else if (kind === 'domain-nameservers') await api(`/domains/${workflowData.managed.id}/nameservers`, 'PUT', { hosts: values.hosts.split(/[\s,]+/).filter(Boolean) });
  else if (kind === 'dns-edit') await api(`/domains/${workflowData.recordDomain.id}/dns/${form.dataset.id}`, 'PATCH', { ...values, proxied: values.proxied === 'on' });
  else if (kind === 'zone-edit') { await api(`/dns/zones/${encodeURIComponent(workflowData.zoneId)}/records/${form.dataset.id}`, 'PATCH', { ...values, proxied: values.proxied === 'on' }); await workflowAction('zone-records', workflowData.zoneId); return true; }
  else if (kind === 'zone-dns') { await api(`/dns/zones/${encodeURIComponent(workflowData.zoneId)}/records`, 'POST', { ...values, proxied: values.proxied === 'on' }); await workflowAction('zone-records', workflowData.zoneId); return true; }
  else return false;
  dialog.close(); notice(translate('success')); await loadPage(); return true;
}
