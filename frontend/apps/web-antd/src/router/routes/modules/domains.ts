import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Domains',
    path: '/domains',
    component: () => import('#/views/domains/index.vue'),
    meta: {
      permissions: ['domain:read'],
      icon: 'lucide:globe',
      order: 10,
      title: 'deck.nav.domains',
      descriptionKey: 'deck.description.domains',
    },
  },
];

export default routes;
