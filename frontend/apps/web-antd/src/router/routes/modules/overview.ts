import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Overview',
    path: '/overview',
    component: () => import('#/views/overview/index.vue'),
    meta: {
      affixTab: true,
      permissions: ['domain:read'],
      icon: 'lucide:layout-dashboard',
      order: 0,
      title: 'deck.nav.overview',
      descriptionKey: 'deck.description.overview',
    },
  },
];

export default routes;
