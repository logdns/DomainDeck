import type { BoardCopy } from './copy';
import type { DomainItem } from '#/api/domaindeck';
import { createElement as h, useEffect, useRef, useState } from 'react';
import { Badge, Button } from './components';

export interface BoardMenu { path: string; name: string; group?: string }
export interface ShellModel {
  copy: BoardCopy;
  menus: BoardMenu[];
  path: string;
  title: string;
  username: string;
  dark: boolean;
  navigate: (path: string) => void;
  classic: () => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  logout: () => void;
}

export function Icon({ name = 'grid' }: { name?: string }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    search: 'm21 21-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
    sun: 'M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7m0-12.8-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
    shield: 'm12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Zm-4 9 3 3 5-6',
    server: 'M4 3h16v7H4zM4 14h16v7H4zM8 6.5h.01M8 17.5h.01',
    refresh: 'M20 7v5h-5M4 17v-5h5M5.6 7a7 7 0 0 1 11.7-2L20 8M4 16l2.7 3A7 7 0 0 0 18.4 17',
  };
  return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] || paths.grid }));
}

const menuIcon = (path: string) => path.includes('dns') || path.includes('providers') ? 'server' : path.includes('domain') || path.includes('register') || path.includes('transfer') ? 'globe' : 'grid';

export function WorkspaceShell(model: ShellModel) {
  const { copy, menus, path, navigate } = model;
  const search = useRef<HTMLDialogElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openSearch = () => { setQuery(''); search.current?.showModal(); searchInput.current?.focus(); };
  const go = (target: string) => { search.current?.close(); drawer.current?.close(); setDrawerOpen(false); navigate(target); };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => { drawer.current?.close(); setDrawerOpen(false); }, [path]);
  const navigation = (mobile = false) => h('div', { className: 'board-sidebar-content' },
    h('div', { className: 'board-brand' }, h('span', { className: 'board-brand-mark' }, h(Icon, { name: 'globe' })), h('span', null, 'DomainDeck'), mobile ? h(Button, { variant: 'secondary', 'aria-label': copy.close, onClick: () => { drawer.current?.close(); setDrawerOpen(false); } }, h(Icon, { name: 'close' })) : null),
    h('div', { className: 'board-workspace-label' }, h('span', { className: 'board-workspace-avatar' }, 'D'), h('div', null, h('strong', null, copy.workspace), h('small', null, 'Board UI · DomainDeck'))),
    h('p', { className: 'board-nav-caption' }, copy.manage),
    h('nav', { 'aria-label': copy.navigation }, menus.map((item) => h('button', { key: item.path, type: 'button', className: `board-nav-item ${path === item.path ? 'is-active' : ''}`, 'aria-current': path === item.path ? 'page' : undefined, onClick: () => go(item.path) }, h(Icon, { name: menuIcon(item.path) }), h('span', null, item.name), item.path === '/overview' ? h(Badge, { color: path === item.path ? 'primary' : 'neutral' }, '01') : null))),
    h('div', { className: 'board-sidebar-footer' }, h('p', null, copy.readOnly), h(Button, { variant: 'secondary', onClick: model.classic }, copy.classic)),
  );
  const results = menus.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return h('div', null,
    h('aside', { className: 'board-sidebar' }, navigation()),
    h('header', { className: 'board-topbar' },
      h(Button, { className: 'board-mobile-menu', variant: 'secondary', 'aria-label': copy.menu, 'aria-expanded': drawerOpen, 'aria-controls': 'board-mobile-navigation', onClick: () => { drawer.current?.showModal(); setDrawerOpen(true); } }, h(Icon, { name: 'menu' })),
      h('div', { className: 'board-breadcrumb' }, h('span', null, copy.console), h('span', null, '/'), h('strong', null, model.title)),
      h('div', { className: 'board-topbar-actions' },
        h(Button, { variant: 'secondary', className: 'board-search-trigger', 'aria-label': copy.search, onClick: openSearch }, h(Icon, { name: 'search' }), h('span', null, copy.search), h('kbd', null, '⌘ K')),
        h(Button, { variant: 'secondary', 'aria-label': copy.theme, onClick: model.toggleTheme }, h(Icon, { name: 'sun' })),
        h(Button, { variant: 'secondary', 'aria-label': copy.language, onClick: model.toggleLanguage }, '中 / EN'),
        h('span', { className: 'board-user', title: model.username }, model.username.slice(0, 1).toUpperCase()),
        h(Button, { variant: 'ghost', onClick: model.logout }, copy.logout))),
    h('dialog', { ref: drawer, id: 'board-mobile-navigation', className: 'board-nav-dialog', 'aria-label': copy.navigation, onClose: () => setDrawerOpen(false), onClick: (event) => { if (event.target === event.currentTarget) { drawer.current?.close(); setDrawerOpen(false); } } }, navigation(true)),
    h('dialog', { ref: search, className: 'board-search-dialog', 'aria-label': copy.search },
      h('div', { className: 'board-search-input' }, h(Icon, { name: 'search' }), h('input', { ref: searchInput, value: query, placeholder: copy.searchPlaceholder, 'aria-label': copy.search, onChange: (event) => setQuery(event.target.value) }), h(Button, { variant: 'secondary', 'aria-label': copy.close, onClick: () => search.current?.close() }, h(Icon, { name: 'close' }))),
      h('div', { className: 'board-search-results' }, results.length ? results.map((item) => h('button', { key: item.path, type: 'button', onClick: () => go(item.path) }, h(Icon, { name: menuIcon(item.path) }), item.name, h(Icon, { name: 'arrow' }))) : h('p', null, copy.noResults))),
  );
}

export interface DashboardModel {
  copy: BoardCopy;
  locale: string;
  username: string;
  loading: boolean;
  failed: boolean;
  hasData: boolean;
  updatedAt: null | number;
  domains: DomainItem[];
  stats: { total: number; expiring: number; critical: number; coverage: number; zoneTotal: number };
  actions: { path: string; name: string }[];
  canConnect: boolean;
  canDns: boolean;
  refresh: () => void;
  navigate: (path: string) => void;
}

export function WorkspaceDashboard(model: DashboardModel) {
  const { copy, domains, stats, navigate } = model;
  const deadlines = domains.filter((domain) => domain.daysLeft != null && domain.daysLeft <= 45).sort((first, second) => first.daysLeft! - second.daysLeft!).slice(0, 5);
  const providerCounts = new Map<string, number>();
  for (const domain of domains) {
    const name = domain.provider || copy.unknown;
    providerCounts.set(name, (providerCounts.get(name) || 0) + 1);
  }
  const distribution = [...providerCounts].sort((first, second) => second[1] - first[1]);
  const metric = (label: string, value: string, detail: string, icon: string, path: string, warning = false, disabled = false) => h('button', { key: label, type: 'button', disabled, className: `board-stat ${warning ? 'board-stat-warning' : ''}`, onClick: () => navigate(path) }, h('div', { className: 'board-stat-label' }, label, h(Icon, { name: icon })), h('strong', null, value), h('span', { className: 'board-stat-detail' }, detail, disabled ? null : h(Icon, { name: 'arrow' })));
  const value = (amount: number, suffix = '') => model.hasData ? `${amount.toLocaleString(model.locale)}${suffix}` : '—';
  return h('div', { className: 'board-dashboard' },
    h('section', { className: 'board-welcome' },
      h('div', null, h('p', { className: 'board-eyebrow' }, 'DOMAIN WORKSPACE'), h('h1', { className: 'deck-heading' }, copy.title), h('p', { className: 'board-subtitle' }, copy.subtitle)),
      h('div', { className: 'board-welcome-actions' }, h('span', null, model.updatedAt ? `${copy.updated} ${new Date(model.updatedAt).toLocaleTimeString(model.locale, { hour: '2-digit', minute: '2-digit' })}` : copy.notUpdated), h(Button, { variant: 'secondary', disabled: model.loading, onClick: model.refresh }, h(Icon, { name: 'refresh' }), model.loading ? copy.refreshing : copy.refresh))),
    model.failed ? h('div', { className: 'board-error', role: 'alert' }, h('span', null, copy.error, model.hasData ? ` ${copy.stale}` : ''), h(Button, { variant: 'secondary', onClick: model.refresh }, copy.retry)) : null,
    h('section', { className: 'board-stats', 'aria-label': copy.overview, 'aria-busy': model.loading },
      metric(copy.total, value(stats.total), copy.totalHint, 'globe', '/domains'),
      metric(copy.expiring, value(stats.expiring), copy.expiringHint, 'clock', '/domains?filter=expiring', stats.critical > 0),
      metric(copy.zones, value(stats.zoneTotal), copy.zonesHint, 'server', '/dns', false, !model.canDns),
      metric(copy.coverage, value(stats.coverage, '%'), copy.coverageHint, 'shield', '/domains?filter=noauto')),
    model.loading && !model.hasData ? h('p', { className: 'board-loading', role: 'status' }, copy.loading) : null,
    h('div', { className: 'board-main-grid' },
      h('section', { className: 'board-panel board-deadlines' },
        h('div', { className: 'board-panel-heading' }, h('div', null, h('h2', null, copy.attention, h(Badge, { color: stats.critical ? 'primary' : 'neutral' }, value(stats.expiring))), h('p', null, copy.expiringHint)), h(Button, { variant: 'secondary', onClick: () => navigate('/domains') }, copy.allDomains)),
        !model.hasData ? h('div', { className: 'board-empty' }, h(Icon, { name: 'globe' }), model.failed ? copy.error : copy.loading) : deadlines.length ? h('div', { className: 'board-table-scroll' }, h('table', null,
          h('thead', null, h('tr', null, [copy.domain, copy.deadline, copy.status, copy.protection].map((text) => h('th', { key: text, scope: 'col' }, text)))),
          h('tbody', null, deadlines.map((domain) => h('tr', { key: `${domain.connectionId}:${domain.name}` },
            h('td', null, h('button', { className: 'board-domain-link', onClick: () => navigate(`/domains?q=${encodeURIComponent(domain.name)}`) }, h('span', { className: 'board-domain-icon' }, domain.name.slice(0, 1).toUpperCase()), h('span', null, h('strong', null, domain.unicodeName || domain.name), h('small', null, domain.connectionName || domain.provider)))),
            h('td', null, domain.expirationDate?.slice(0, 10) || '—'),
            h('td', null, h('span', { className: `board-status ${domain.daysLeft! <= 14 ? 'board-status-danger' : 'board-status-warning'}` }, domain.daysLeft! < 0 ? copy.expired : `${domain.daysLeft} ${copy.days}`)),
            h('td', null, h('span', { className: `board-renewal ${domain.autoRenew ? 'is-on' : ''}` }, domain.autoRenew ? copy.on : copy.off))))))) : h('div', { className: 'board-empty' }, h(Icon, { name: domains.length ? 'shield' : 'globe' }), h('strong', null, domains.length ? copy.healthy : copy.empty), !domains.length ? h('p', null, copy.emptyHint) : null, h(Button, { variant: 'secondary', onClick: () => navigate('/domains') }, copy.browse))),
      h('section', { className: 'board-panel board-distribution' }, h('div', { className: 'board-panel-heading' }, h('div', null, h('h2', null, copy.providers), h('p', null, copy.providerHint))),
        distribution.length ? h('div', { className: 'board-provider-list' }, distribution.map(([name, count], index) => h('div', { key: name, className: 'board-provider-row' }, h('div', null, h('span', null, h('i', { className: `board-color-${index % 4}` }), name), h('strong', null, `${count} / ${domains.length}`)), h('div', { className: 'board-meter', role: 'img', 'aria-label': `${name}: ${count} ${copy.count}` }, h('span', { className: `board-color-${index % 4}`, style: { width: `${count / domains.length * 100}%` } }))))) : h('div', { className: 'board-empty' }, copy.noProvider)),
      h('section', { className: 'board-panel board-quick' }, h('div', { className: 'board-panel-heading' }, h('div', null, h('h2', null, copy.quick), h('p', null, copy.quickHint))), h('div', { className: 'board-quick-grid' }, model.actions.map((action) => h('button', { type: 'button', key: action.path, onClick: () => navigate(action.path) }, h('span', { className: 'board-action-icon' }, h(Icon, { name: menuIcon(action.path) })), h('strong', null, action.name), h(Icon, { name: 'arrow' }))))),
      model.canConnect ? h('section', { className: 'board-connect' }, h('span', { className: 'board-connect-icon' }, h(Icon, { name: 'server' })), h('h2', null, copy.instructions), h('p', null, copy.instructionsHint), h(Button, { onClick: () => navigate('/providers') }, copy.addProvider, h(Icon, { name: 'arrow' }))) : null),
    h('p', { className: 'board-footer-note' }, 'DomainDeck · Board UI', h('span', null, copy.readOnly)),
  );
}
