import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  return requestClient.get<
    UserInfo & { permissions: string[]; roleNames?: string[] }
  >('/user/info');
}
