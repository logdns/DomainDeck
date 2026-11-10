<script lang="ts" setup>
import type { ComponentType } from 'react';
import type { Root } from 'react-dom/client';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import '#/boardui/theme.css';

const props = defineProps<{ view: ComponentType<any>; model: Record<string, any> }>();
const host = ref<HTMLElement>();
let root: Root | undefined;
function render() { root?.render(createElement(props.view, props.model)); }
onMounted(() => { if (host.value) { root = createRoot(host.value); render(); } });
watch(() => props.model, render);
onBeforeUnmount(() => { root?.unmount(); root = undefined; });
</script>

<template><div ref="host" class="boardui-root" /></template>
