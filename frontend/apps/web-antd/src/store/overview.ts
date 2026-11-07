import type { OverviewResponse } from '#/api/domaindeck';

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { getOverview } from '#/api/domaindeck';

export const useOverviewStore = defineStore('deck-overview', () => {
  const data = ref<null | OverviewResponse>(null);
  const loading = ref(false);
  const failed = ref(false);
  const updatedAt = ref<null | number>(null);
  let pending: null | Promise<void> = null;
  let generation = 0;

  const domains = computed(() => data.value?.domains?.items ?? []);
  const stats = computed(() => {
    const total = domains.value.length;
    const autoOff = domains.value.filter((domain) => !domain.autoRenew).length;
    return {
      total: data.value?.domains?.total ?? total,
      autoOff,
      coverage: total ? Math.round(((total - autoOff) / total) * 100) : 0,
      expiring: domains.value.filter(
        (domain) => domain.daysLeft != null && domain.daysLeft <= 45,
      ).length,
      critical: domains.value.filter(
        (domain) => domain.daysLeft != null && domain.daysLeft <= 14,
      ).length,
      activeZones:
        data.value?.zones?.items?.filter((zone) => zone.status === 'active')
          .length ?? 0,
      zoneTotal: data.value?.zones?.total ?? 0,
      registrars: data.value?.stats?.registrars ?? 0,
    };
  });

  function refresh(): Promise<void> {
    if (pending) return pending;
    const requestGeneration = generation;
    loading.value = true;
    failed.value = false;
    pending = getOverview()
      .then((response) => {
        if (requestGeneration !== generation) return;
        data.value = response;
        updatedAt.value = Date.now();
      })
      .catch(() => {
        if (requestGeneration === generation) failed.value = true;
      })
      .finally(() => {
        if (requestGeneration === generation) {
          loading.value = false;
          pending = null;
        }
      });
    return pending;
  }

  function $reset() {
    generation++;
    data.value = null;
    loading.value = false;
    failed.value = false;
    updatedAt.value = null;
    pending = null;
  }

  return { $reset, data, domains, failed, loading, refresh, stats, updatedAt };
});
