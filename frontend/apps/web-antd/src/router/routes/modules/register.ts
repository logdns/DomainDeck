import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'DomainRegister',
    path: '/register',
    component: () => import('#/views/register/index.vue'),
    meta: {
      permissions: ['domain:read'],
      icon: 'lucide:search',
      order: 30,
      title: 'deck.nav.register',
      descriptionKey: 'deck.description.register',
    },
  },
];

export default routes;
