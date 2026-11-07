<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  actionLabel?: string;
  detail: string;
  icon: Component;
  label: string;
  loading?: boolean;
  tone?: 'brand' | 'danger' | 'success' | 'warning';
  value: number | string;
}>();
defineEmits<{ select: [] }>();
</script>

<template>
  <article
    class="metric-card"
    :data-tone="tone || 'brand'"
    :aria-busy="loading"
  >
    <div class="metric-top">
      <span>{{ label }}</span
      ><span class="metric-icon"
        ><component :is="icon" aria-hidden="true"
      /></span>
    </div>
    <div v-if="loading" class="metric-skeleton" />
    <div v-else class="metric-value">{{ value }}</div>
    <div class="metric-footer">
      <p>{{ detail }}</p>
      <button
        v-if="actionLabel"
        class="metric-action"
        :aria-label="actionLabel"
        @click="$emit('select')"
      >
        ↗
      </button>
    </div>
  </article>
</template>

<style scoped>
.metric-card {
  --metric-ink: var(--dd-brand);
  --metric-fill: var(--dd-brand-soft);
  min-width: 0;
  padding: 21px 23px 17px;
  background: var(--dd-surface);
  border: 1px solid var(--dd-border);
  border-radius: var(--dd-radius);
  box-shadow: var(--dd-shadow);
}
.metric-card[data-tone='warning'] {
  --metric-ink: var(--dd-warning);
  --metric-fill: var(--dd-warning-soft);
}
.metric-card[data-tone='danger'] {
  --metric-ink: var(--dd-danger);
  --metric-fill: var(--dd-danger-soft);
}
.metric-card[data-tone='success'] {
  --metric-ink: var(--dd-success);
  --metric-fill: var(--dd-success-soft);
}
.metric-top {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: var(--dd-font-body);
  font-weight: 600;
  color: var(--dd-text-secondary);
}
.metric-icon {
  display: grid;
  width: 36px;
  height: 36px;
  color: var(--metric-ink);
  background: var(--metric-fill);
  border-radius: 11px;
  place-items: center;
}
.metric-icon :deep(svg) {
  width: 18px;
  height: 18px;
}
.metric-value {
  margin-block: 9px 10px;
  font-size: var(--dd-font-metric);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -1.5px;
  color: var(--dd-text);
  font-variant-numeric: tabular-nums;
}
.metric-footer {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 25px;
}
.metric-footer p {
  font-size: var(--dd-font-small);
  line-height: 1.6;
  color: var(--dd-text-muted);
}
.metric-action {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  font-size: 17px;
  color: var(--metric-ink);
  background: var(--metric-fill);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
.metric-skeleton {
  height: 39px;
  max-width: 85px;
  margin-block: 9px 10px;
  background: var(--dd-surface-raised);
  border-radius: 8px;
}
</style>
