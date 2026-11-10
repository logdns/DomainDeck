<script lang="ts" setup>
import type { MenuRecordRaw } from '@vben/types';
import type { BoardMenu, ShellModel } from '#/boardui/workspace';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { preferences, updatePreferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { LayoutContent } from '@vben/layouts';
import { boardCopy } from '#/boardui/copy';
import { WorkspaceShell } from '#/boardui/workspace';
import BoardRoot from '#/components/board-root.vue';
import { useInterfaceTemplate } from '#/composables/use-interface-template';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

const route = useRoute();
const router = useRouter();
const access = useAccessStore();
const user = useUserStore();
const auth = useAuthStore();
const { isDark } = usePreferences();
const { selectTemplate } = useInterfaceTemplate();

function flatten(items: MenuRecordRaw[]): BoardMenu[] {
  return items.filter((item) => item.show !== false && !item.disabled).flatMap((item) => item.children?.length ? flatten(item.children) : [{ path: item.path, name: $t(item.name) }]);
}

const model = computed<ShellModel>(() => ({
  copy: boardCopy(preferences.app.locale),
  menus: flatten(access.accessMenus),
  path: route.path,
  title: $t(String(route.meta.title || 'deck.nav.overview')),
  username: user.userInfo?.realName || user.userInfo?.username || 'DomainDeck',
  dark: isDark.value,
  navigate: (path) => { void router.push(path); },
  classic: () => selectTemplate('vben'),
  toggleTheme: () => updatePreferences({ theme: { mode: isDark.value ? 'light' : 'dark' } }),
  toggleLanguage: () => updatePreferences({ app: { locale: preferences.app.locale === 'en-US' ? 'zh-CN' : 'en-US' } }),
  logout: () => { void auth.logout(false); },
}));
</script>

<template>
  <div class="board-shell" data-interface-template="boardui">
    <BoardRoot :view="WorkspaceShell" :model="model" />
    <main id="board-content" class="board-content"><LayoutContent /></main>
  </div>
</template>
