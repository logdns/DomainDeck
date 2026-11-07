import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Notifications',
    path: '/notifications',
    component: () => import('#/views/notifications/index.vue'),
    meta: {
      permissions: ['settings:read'],
      icon: 'lucide:bell-ring',
      order: 56,
      title: 'deck.nav.notifications',
      descriptionKey: 'deck.description.notifications',
    },
  },
];

export default routes;
