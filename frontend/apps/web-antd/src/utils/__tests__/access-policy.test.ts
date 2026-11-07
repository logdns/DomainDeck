import type { RouteRecordRaw } from 'vue-router';

import { describe, expect, it } from 'vitest';

import {
  filterAccessibleRoutes,
  findRouteByPath,
  firstAccessiblePath,
  hasPermissions,
} from '../access-policy';

const routes: RouteRecordRaw[] = [
  {
    path: '/overview',
    name: 'Overview',
    component: {},
    meta: { title: 'Overview', permissions: ['domain:read'] },
  },
  {
    path: '/dns',
    name: 'Dns',
    component: {},
    meta: { title: 'DNS', permissions: ['dns:read'] },
  },
  {
    path: '/system',
    name: 'System',
    children: [
      {
        path: 'accounts',
        name: 'Accounts',
        component: {},
        meta: { title: 'Accounts', permissions: ['account:read'] },
      },
      {
        path: 'roles',
        name: 'Roles',
        component: {},
        meta: { title: 'Roles', permissions: ['role:read'] },
      },
    ],
  },
];

describe('permission-code navigation', () => {
  it('supports wildcard without depending on role names', () => {
    expect(hasPermissions(['*'], ['role:write'])).toBe(true);
    expect(filterAccessibleRoutes(routes, ['*'])).toHaveLength(3);
  });
  it('requires every declared permission', () => {
    expect(
      hasPermissions(['domain:read'], ['domain:read', 'domain:billing']),
    ).toBe(false);
  });
  it('retains only the custom role’s allowed pages', () => {
    expect(
      filterAccessibleRoutes(routes, ['dns:read']).map((route) => route.path),
    ).toEqual(['/dns']);
  });
  it('prunes empty groups and keeps authorized nested children', () => {
    const filtered = filterAccessibleRoutes(routes, ['role:read']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.map((route) => route.path)).toEqual([
      'roles',
    ]);
    expect(firstAccessiblePath(filtered)).toBe('/system/roles');
  });
  it('does not mutate the source route tree', () => {
    filterAccessibleRoutes(routes, []);
    expect(routes[2]?.children).toHaveLength(2);
  });
  it('resolves nested paths for direct-navigation checks', () => {
    expect(findRouteByPath(routes, '/system/accounts')?.name).toBe('Accounts');
    expect(findRouteByPath(routes, '/missing')).toBeUndefined();
  });
  it('provides a safe fallback for users with no permissions', () => {
    expect(firstAccessiblePath(filterAccessibleRoutes(routes, []))).toBe(
      '/access-denied',
    );
  });
  it('chooses the first visible menu by order without mutating input', () => {
    const unordered: RouteRecordRaw[] = [
      {
        path: '/notifications',
        component: {},
        meta: { title: 'Notifications', order: 56 },
      },
      {
        path: '/providers',
        component: {},
        meta: { title: 'Providers', order: 55 },
      },
    ];
    expect(firstAccessiblePath(unordered)).toBe('/providers');
    expect(unordered[0]?.path).toBe('/notifications');
  });
});
