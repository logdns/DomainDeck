<script lang="ts" setup>
import { preferences } from '@vben/preferences';
import { useInterfaceTemplate } from '#/composables/use-interface-template';

const { interfaceTemplate, selectTemplate } = useInterfaceTemplate();
</script>

<template>
  <label class="deck-template-switch">
    <span>{{ preferences.app.locale === 'en-US' ? 'Template' : '界面模板' }}</span>
    <select
      :aria-label="preferences.app.locale === 'en-US' ? 'Template' : '界面模板'"
      :value="interfaceTemplate"
      @change="selectTemplate(($event.target as HTMLSelectElement).value)"
    >
      <option value="vben">Vben Classic</option>
      <option value="boardui">Board UI</option>
    </select>
  </label>
</template>

<style scoped>
.deck-template-switch { display: inline-flex; gap: 8px; align-items: center; margin-inline: 12px; font-size: 14px; color: var(--dd-text-secondary); }
select { max-width: 140px; padding: 6px 10px; color: var(--dd-text); background: var(--dd-surface); border: 1px solid var(--dd-border); border-radius: 8px; }
select:focus-visible { outline: 2px solid var(--dd-brand); outline-offset: 2px; }
@media (width <= 640px) { .deck-template-switch > span { display: none; } }
</style>
