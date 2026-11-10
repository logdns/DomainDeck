import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { boardCopy } from '../../boardui/copy';
import { WorkspaceDashboard, WorkspaceShell } from '../../boardui/workspace';
import type { DashboardModel } from '../../boardui/workspace';

const base: DashboardModel = {
  copy: boardCopy('zh-CN'), locale: 'zh-CN', username: 'Fixture',
  loading: false, failed: false, hasData: true, updatedAt: null,
  domains: [], stats: { total: 0, expiring: 0, critical: 0, coverage: 0, zoneTotal: 0 },
  canConnect: false, canDns: false, actions: [{ name: '查看域名资产', path: '/domains' }],
  navigate: () => {}, refresh: () => {},
};

describe('Board UI workspace data and security states', () => {
  it('renders empty and failed states without presenting missing data as a loaded zero', () => {
    const empty = renderToStaticMarkup(createElement(WorkspaceDashboard, base));
    expect(empty).toContain('还没有域名资产');
    expect(empty).not.toContain('连接你的域名服务');
    const failed = renderToStaticMarkup(createElement(WorkspaceDashboard, { ...base, hasData: false, failed: true }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('—');
    expect(failed).not.toContain('还没有域名资产');
    const stale = renderToStaticMarkup(createElement(WorkspaceDashboard, { ...base, failed: true }));
    expect(stale).toContain('上次成功加载的数据');
  });

  it('escapes provider and domain text, highlights expired assets and preserves actual totals', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceDashboard, {
      ...base,
      domains: [{ name: '<script>fixture</script>', unicodeName: '', connectionId: 'fixture', connectionName: 'Fixture connection', provider: '<img src=x>', daysLeft: -1, expirationDate: '2030-01-01', autoRenew: false } as DashboardModel['domains'][number]],
      stats: { ...base.stats, total: 1, expiring: 1, critical: 1 },
    }));
    expect(html).toContain('&lt;script&gt;fixture&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('board-status-danger');
    expect(html).toContain('已过期');
    expect(html).toContain('1 / 1');
  });

  it('limits shortcuts and navigation to the supplied authorized routes and supports English', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceShell, {
      copy: boardCopy('en-US'), menus: [{ path: '/domains', name: 'Domain assets' }], path: '/domains', title: 'Domains', username: 'Fixture', dark: false,
      navigate: () => {}, classic: () => {}, toggleTheme: () => {}, toggleLanguage: () => {}, logout: () => {},
    }));
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Domain assets');
    expect(html).not.toContain('Payments');
    const dashboard = renderToStaticMarkup(createElement(WorkspaceDashboard, { ...base, copy: boardCopy('en-US'), canConnect: true }));
    expect(dashboard).toContain('Every domain. One clear view.');
    expect(dashboard).toContain('Connect a provider');
  });

  it('counts provider names that match object prototype properties as ordinary text', () => {
    const domains = ['__proto__', 'constructor', 'toString'].map((provider) => ({ name: `${provider}.example`, provider, daysLeft: 100, autoRenew: false }) as DashboardModel['domains'][number]);
    const html = renderToStaticMarkup(createElement(WorkspaceDashboard, { ...base, domains }));
    expect(html).toContain('__proto__');
    expect(html).toContain('constructor');
    expect(html).toContain('toString');
    expect(html.match(/1 \/ 3/g)).toHaveLength(3);
    expect(html).not.toContain('NaN');
  });
});
