import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      resolve: {
        // 保证 vue / vue-router / pinia 只有一份实例，避免生产构建下 inject 失效
        dedupe: ['pinia', 'vue', 'vue-router'],
      },
      server: {
        proxy: {
          // 直接转发到本地 DomainDeck 服务，保留 /api 前缀
          '/api': {
            changeOrigin: false,
            target: 'http://127.0.0.1:4780',
            ws: true,
          },
        },
      },
    },
  };
});
