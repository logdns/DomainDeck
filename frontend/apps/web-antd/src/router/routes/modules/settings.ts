import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Settings',
    path: '/settings',
    component: () => import('#/views/settings/index.vue'),
    meta: {
      permissions: ['settings:read'],
      icon: 'lucide:settings',
      order: 90,
      title: 'deck.nav.settings',
      descriptionKey: 'deck.description.settings',
    },
  },
];

export default routes;
