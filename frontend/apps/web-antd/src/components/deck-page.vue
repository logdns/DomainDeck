<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { $t } from '#/locales';

const props = defineProps<{ description?: string; title?: string }>();
const route = useRoute();
const heading = computed(() =>
  route.meta.title ? $t(route.meta.title) : props.title,
);
const description = computed(() => {
  const key = route.meta.descriptionKey;
  return typeof key === 'string' ? $t(key) : props.description;
});
</script>

<template>
  <Page
    class="deck-page"
    header-class="deck-page-header"
    content-class="deck-page-content"
  >
    <template #title>
      <div class="deck-eyebrow">
        {{ $t('deck.shell.workspace') }} <span>/</span> {{ heading }}
      </div>
      <h1 class="deck-heading">{{ heading }}</h1>
    </template>
    <template #description
      ><p class="deck-description">{{ description }}</p></template
    >
    <template v-if="$slots.extra" #extra
      ><div class="deck-page-actions"><slot name="extra" /></div
    ></template>
    <slot />
  </Page>
</template>

<style scoped>
.deck-eyebrow {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  font-size: var(--dd-font-small);
  font-weight: 500;
  color: var(--dd-text-muted);
}
.deck-eyebrow span {
  opacity: 0.5;
}
.deck-heading {
  margin: 0;
  font-size: var(--dd-font-heading);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.7px;
  color: var(--dd-text);
}
.deck-description {
  margin-top: 9px;
  font-size: var(--dd-font-body);
  line-height: 1.7;
  color: var(--dd-text-secondary);
}
.deck-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
