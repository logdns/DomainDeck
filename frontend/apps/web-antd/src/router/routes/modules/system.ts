import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'System',
    path: '/system',
    meta: {
      icon: 'lucide:shield-check',
      order: 60,
      title: 'deck.nav.system',
    },
    children: [
      {
        name: 'SystemAccounts',
        path: 'accounts',
        component: () => import('#/views/system/accounts.vue'),
        meta: {
          permissions: ['account:read'],
          icon: 'lucide:users',
          title: 'deck.nav.accounts',
          descriptionKey: 'deck.description.accounts',
        },
      },
      {
        name: 'SystemRoles',
        path: 'roles',
        component: () => import('#/views/system/roles.vue'),
        meta: {
          permissions: ['role:read'],
          icon: 'lucide:key-round',
          title: 'deck.nav.roles',
          descriptionKey: 'deck.description.roles',
        },
      },
    ],
  },
];

export default routes;
