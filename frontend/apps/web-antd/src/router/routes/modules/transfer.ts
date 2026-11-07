import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Transfer',
    path: '/transfer',
    component: () => import('#/views/transfer/index.vue'),
    meta: {
      permissions: ['transfer:read'],
      icon: 'lucide:arrow-left-right',
      order: 40,
      title: 'deck.nav.transfer',
      descriptionKey: 'deck.description.transfer',
    },
  },
];

export default routes;
