<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';

import { useAuthStore } from '#/store';
import { $t } from '#/locales';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('deck.login.usernamePlaceholder'),
        autocomplete: 'username',
      },
      fieldName: 'username',
      label: $t('deck.login.username'),
      rules: z
        .string()
        .min(1, { message: $t('deck.login.usernamePlaceholder') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('deck.login.passwordPlaceholder'),
        autocomplete: 'current-password',
      },
      fieldName: 'password',
      label: $t('deck.login.password'),
      rules: z
        .string()
        .min(1, { message: $t('deck.login.passwordPlaceholder') }),
    },
  ];
});
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-forget-password="false"
    :show-qrcode-login="false"
    :show-register="false"
    :show-third-party-login="false"
    :sub-title="$t('deck.login.subtitle')"
    :title="$t('deck.login.title')"
    @submit="authStore.authLogin"
  />
</template>
