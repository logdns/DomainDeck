import type { RouteRecordRaw } from 'vue-router';

export function hasPermissions(granted: string[], required: string[] = []) {
  return (
    granted.includes('*') ||
    required.every((permission) => granted.includes(permission))
  );
}

export function filterAccessibleRoutes(
  routes: RouteRecordRaw[],
  granted: string[],
): RouteRecordRaw[] {
  return routes.flatMap((route) => {
    if (!hasPermissions(granted, route.meta?.permissions)) return [];
    const children = route.children
      ? filterAccessibleRoutes(route.children, granted)
      : undefined;
    if (route.children?.length && !children?.length) return [];
    return [
      {
        ...route,
        meta: { ...route.meta },
        ...(children ? { children } : {}),
      } as RouteRecordRaw,
    ];
  });
}

export function findRouteByPath(
  routes: RouteRecordRaw[],
  path: string,
  parent = '',
): RouteRecordRaw | undefined {
  for (const route of routes) {
    const fullPath = route.path.startsWith('/')
      ? route.path
      : `${parent}/${route.path}`;
    if (fullPath === path) return route;
    const child =
      route.children && findRouteByPath(route.children, path, fullPath);
    if (child) return child;
  }
}

export function firstAccessiblePath(
  routes: RouteRecordRaw[],
  parent = '',
): string {
  const ordered = [...routes].sort(
    (left, right) => (left.meta?.order ?? 0) - (right.meta?.order ?? 0),
  );
  for (const route of ordered) {
    const fullPath = route.path.startsWith('/')
      ? route.path
      : `${parent}/${route.path}`;
    if (route.children?.length)
      return firstAccessiblePath(route.children, fullPath);
    if (route.component) return fullPath;
  }
  return '/access-denied';
}
