<script lang="ts" setup>
import type { DashboardModel } from '#/boardui/workspace';
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { preferences } from '@vben/preferences';
import { boardCopy } from '#/boardui/copy';
import { WorkspaceDashboard } from '#/boardui/workspace';
import BoardRoot from '#/components/board-root.vue';
import { usePermissions } from '#/composables/use-permissions';
import { useOverviewStore } from '#/store/overview';

const overview = useOverviewStore();
const { can } = usePermissions();
const router = useRouter();
onMounted(() => { if (!overview.data && !overview.loading) void overview.refresh(); });
const model = computed<DashboardModel>(() => {
  const copy = boardCopy(preferences.app.locale);
  return {
    copy, locale: preferences.app.locale, username: '', loading: overview.loading,
    failed: overview.failed, hasData: overview.data !== null, updatedAt: overview.updatedAt,
    domains: overview.domains, stats: overview.stats, canConnect: can('settings:read', 'settings:write'), canDns: can('dns:read'),
    actions: [
      { path: '/domains', name: copy.assetsAction, allowed: can('domain:read') },
      { path: '/dns', name: copy.dnsAction, allowed: can('dns:read') },
      { path: '/register', name: copy.registerAction, allowed: can('domain:read') },
      { path: '/transfer', name: copy.transferAction, allowed: can('transfer:read') },
      { path: '/notifications', name: copy.notificationAction, allowed: can('settings:read') },
    ].filter((item) => item.allowed),
    refresh: () => { void overview.refresh(); },
    navigate: (path) => { void router.push(path); },
  };
});
</script>

<template><BoardRoot :view="WorkspaceDashboard" :model="model" /></template>
