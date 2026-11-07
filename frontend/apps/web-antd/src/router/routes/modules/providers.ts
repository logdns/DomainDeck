import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Providers',
    path: '/providers',
    component: () => import('#/views/providers/index.vue'),
    meta: {
      permissions: ['settings:read'],
      icon: 'lucide:plug-zap',
      order: 55,
      title: 'deck.nav.providers',
      descriptionKey: 'deck.description.providers',
    },
  },
];

export default routes;
