<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { Settings } from '@vben/icons';
import { BasicLayout, LockScreen, UserDropdown } from '@vben/layouts';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { useAuthStore } from '#/store';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import LoginForm from '#/views/_core/authentication/login.vue';
import BoardLayout from './board.vue';
import TemplateSwitch from '#/components/template-switch.vue';
import { useInterfaceTemplate } from '#/composables/use-interface-template';

const { interfaceTemplate } = useInterfaceTemplate();

const router = useRouter();
const userStore = useUserStore();
const accessStore = useAccessStore();
const authStore = useAuthStore();
const { can } = usePermissions();

const avatar = computed(
  () => userStore.userInfo?.avatar ?? preferences.app.defaultAvatar,
);
const roleText = computed(
  () =>
    (userStore.userInfo as any)?.roleNames?.join(' · ') ||
    $t('deck.shell.member'),
);

const menus = computed(() =>
  can('settings:read')
    ? [
        {
          handler: () => router.push('/settings'),
          icon: Settings,
          text: $t('deck.nav.settings'),
        },
      ]
    : [],
);

async function handleLogout() {
  await authStore.logout(false);
}
</script>

<template>
  <BoardLayout v-if="interfaceTemplate === 'boardui'" />
  <BasicLayout
    v-else
    :avatar
    :text="userStore.userInfo?.realName"
    @clear-preferences-and-logout="handleLogout"
    @logout="handleLogout"
  >
    <template #header-left-1>
      <TemplateSwitch />
      <div class="deck-header-label">
        <span class="deck-header-dot" /><span
          >DomainDeck <span class="deck-header-divider">/</span>
          {{ $t('deck.shell.console') }}</span
        >
      </div>
    </template>
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :description="`${userStore.userInfo?.realName ?? ''} · ${roleText}`"
        :menus="menus"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>

<style scoped>
.deck-header-label {
  display: flex;
  gap: 9px;
  align-items: center;
  margin-left: 10px;
  font-size: var(--dd-font-small);
  font-weight: 600;
  color: var(--dd-text-secondary);
}
.deck-header-dot {
  width: 7px;
  height: 7px;
  background: var(--dd-brand);
  border-radius: 50%;
}
.deck-header-divider {
  margin-inline: 10px;
  color: var(--dd-border);
}
@media (width <= 768px) {
  .deck-header-label {
    display: none;
  }
}
</style>
