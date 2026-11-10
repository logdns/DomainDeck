<script lang="ts" setup>
import type { MenuRecordRaw } from "@vben/types";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Bell,
  ChevronRight,
  Grid,
  Link2,
  LogOut,
  MoonStar,
  Search,
  Settings,
  Sun,
} from "@vben/icons";
import { LayoutContent } from "@vben/layouts";
import { loadLocaleMessages } from "@vben/locales";
import { preferences, updatePreferences, usePreferences } from "@vben/preferences";
import { useAccessStore, useUserStore } from "@vben/stores";
import { Button, Drawer } from "ant-design-vue";
import { $t } from "#/locales";
import { useAuthStore } from "#/store";
import { useInterfaceTemplate } from "#/composables/use-interface-template";
import TemplateSwitch from "#/components/template-switch.vue";

const route = useRoute();
const router = useRouter();
const access = useAccessStore();
const user = useUserStore();
const auth = useAuthStore();
const { isDark } = usePreferences();
const { selectTemplate } = useInterfaceTemplate();
const drawerOpen = ref(false);

function flatten(items: MenuRecordRaw[]): MenuRecordRaw[] {
  return items
    .filter((item) => item.show !== false && !item.disabled)
    .flatMap((item) => (item.children?.length ? flatten(item.children) : [item]));
}

const menus = computed(() => flatten(access.accessMenus));
const activePath = computed(
  () =>
    [...menus.value]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => route.path === item.path || route.path.startsWith(`${item.path}/`))?.path ||
    route.path,
);
const displayName = computed(
  () => user.userInfo?.realName || user.userInfo?.username || "DomainDeck",
);
const initials = computed(() => displayName.value.slice(0, 1).toLocaleUpperCase());

function navigate(path: string) {
  drawerOpen.value = false;
  void router.push(path);
}

function toggleTheme() {
  updatePreferences({ theme: { mode: isDark.value ? "light" : "dark" } });
}

async function toggleLanguage() {
  const locale = preferences.app.locale === "en-US" ? "zh-CN" : "en-US";
  updatePreferences({ app: { locale } });
  await loadLocaleMessages(locale);
}

function iconFor(item: MenuRecordRaw) {
  if (typeof item.icon === "string") return Grid;
  return item.icon || Grid;
}
</script>

<template>
  <div class="pro-shell" data-interface-template="pro">
    <aside class="pro-sidebar">
      <div class="pro-brand"><img src="/logo.svg" alt="" /><strong>DomainDeck</strong></div>
      <div class="pro-workspace">
        <span class="pro-avatar">{{ initials }}</span>
        <div>
          <strong>{{ displayName }}</strong
          ><small>{{ $t("deck.shell.workspace") }}</small>
        </div>
      </div>
      <nav class="pro-navigation" :aria-label="$t('deck.pro.navigation')">
        <button
          v-for="item in menus"
          :key="item.path"
          type="button"
          :class="{ active: activePath === item.path }"
          :aria-current="activePath === item.path ? 'page' : undefined"
          @click="navigate(item.path)"
        >
          <component :is="iconFor(item)" /><span>{{ $t(item.name) }}</span
          ><ChevronRight v-if="activePath === item.path" class="pro-nav-current" />
        </button>
      </nav>
      <div class="pro-sidebar-bottom">
        <span class="pro-status-dot" />{{ $t("deck.pro.privateWorkspace") }}
      </div>
    </aside>
    <div class="pro-main">
      <header class="pro-header">
        <div class="pro-header-leading">
          <Button
            class="pro-mobile-menu"
            type="text"
            :aria-label="$t('deck.pro.navigation')"
            @click="drawerOpen = true"
            ><Grid
          /></Button>
          <div class="pro-breadcrumb">
            <span>{{ $t("deck.shell.console") }}</span
            ><ChevronRight /><strong>{{
              $t(String(route.meta.title || "deck.nav.overview"))
            }}</strong>
          </div>
        </div>
        <div class="pro-header-actions">
          <Button
            class="pro-search-action"
            type="text"
            :aria-label="$t('deck.pro.search')"
            @click="navigate('/domains')"
            ><Search /><span class="pro-search-label">{{ $t("deck.common.search") }}</span></Button
          >
          <Button
            class="pro-notifications-action"
            type="text"
            :aria-label="$t('deck.nav.notifications')"
            @click="navigate('/notifications')"
            ><Bell
          /></Button>
          <Button type="text" :aria-label="$t('deck.pro.toggleTheme')" @click="toggleTheme"
            ><Sun v-if="isDark" /><MoonStar v-else
          /></Button>
          <Button type="text" class="pro-language" @click="toggleLanguage">{{
            preferences.app.locale === "en-US" ? "中文" : "EN"
          }}</Button>
          <TemplateSwitch />
          <span class="pro-header-avatar">{{ initials }}</span>
          <Button type="text" :aria-label="$t('deck.pro.logout')" @click="auth.logout(false)"
            ><LogOut
          /></Button>
        </div>
      </header>
      <div class="pro-page-content"><LayoutContent /></div>
    </div>
    <Drawer
      v-model:open="drawerOpen"
      placement="left"
      :width="264"
      :title="$t('deck.shell.workspace')"
      class="pro-mobile-drawer"
    >
      <nav class="pro-navigation">
        <button
          v-for="item in menus"
          :key="item.path"
          type="button"
          :class="{ active: activePath === item.path }"
          @click="navigate(item.path)"
        >
          <component :is="iconFor(item)" /><span>{{ $t(item.name) }}</span>
        </button>
      </nav>
      <div class="pro-drawer-tools">
        <Button block @click="selectTemplate('vben')"><Settings /> Vben Classic</Button
        ><Button block @click="selectTemplate('boardui')"><Link2 /> Board UI</Button>
      </div>
    </Drawer>
  </div>
</template>

<style>
@import "#/styles/pro-template.css";
</style>
