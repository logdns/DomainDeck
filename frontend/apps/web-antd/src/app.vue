<script lang="ts" setup>
import { computed } from 'vue';

import { useAntdDesignTokens } from '@vben/hooks';
import { preferences, usePreferences } from '@vben/preferences';

import { App, ConfigProvider, theme } from 'ant-design-vue';

import { antdLocale } from '#/locales';
import { typography } from '#/design/typography';

defineOptions({ name: 'App' });

const { isDark } = usePreferences();
const { tokens } = useAntdDesignTokens();

const tokenTheme = computed(() => {
  const algorithm = isDark.value
    ? [theme.darkAlgorithm]
    : [theme.defaultAlgorithm];

  // antd 紧凑模式算法
  if (preferences.app.compact) {
    algorithm.push(theme.compactAlgorithm);
  }

  return {
    algorithm,
    token: {
      ...tokens,
      ...typography,
      borderRadius: 10,
      colorPrimary: isDark.value ? '#78a7ff' : '#2563eb',
      colorBgContainer: isDark.value ? '#182435' : '#ffffff',
      colorBorderSecondary: isDark.value ? '#2d3d54' : '#e4eaf3',
      colorText: isDark.value ? '#e1eafa' : '#172b4d',
      colorTextSecondary: isDark.value ? '#b0c0d7' : '#526581',
      colorTextTertiary: isDark.value ? '#a4b5ce' : '#596d89',
      colorTextQuaternary: isDark.value ? '#a4b5ce' : '#596d89',
    },
    components: {
      Card: { borderRadiusLG: 16 },
      Table: { borderRadiusLG: 12 },
      Button: { fontWeight: 600 },
    },
  };
});
</script>

<template>
  <ConfigProvider :locale="antdLocale" :theme="tokenTheme">
    <App>
      <RouterView />
    </App>
  </ConfigProvider>
</template>
