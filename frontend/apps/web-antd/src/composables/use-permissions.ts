import { useAccessStore } from '@vben/stores';

import { hasPermissions } from '#/utils/access-policy';

export function usePermissions() {
  const accessStore = useAccessStore();
  return {
    can: (...permissions: string[]) =>
      hasPermissions(accessStore.accessCodes, permissions),
  };
}
