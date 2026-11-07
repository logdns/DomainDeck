import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Payments',
    path: '/payments',
    component: () => import('#/views/payments/index.vue'),
    meta: {
      permissions: ['payment:read'],
      icon: 'lucide:credit-card',
      order: 50,
      title: 'deck.nav.payments',
      descriptionKey: 'deck.description.payments',
    },
  },
];

export default routes;
