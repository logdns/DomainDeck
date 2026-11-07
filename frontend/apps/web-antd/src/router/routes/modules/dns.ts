import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Dns',
    path: '/dns',
    component: () => import('#/views/dns/index.vue'),
    meta: {
      permissions: ['dns:read'],
      icon: 'lucide:network',
      order: 20,
      title: 'deck.nav.dns',
      descriptionKey: 'deck.description.dns',
    },
  },
];

export default routes;
