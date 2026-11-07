import { defineOverridesPreferences } from '@vben/preferences';

/**
 * 项目偏好：企业后台风格——深色侧栏 + 浅色内容区 + 克制的单一主色
 * 修改后需要清缓存（localStorage）才会完全生效
 */
export const overridesPreferences = defineOverridesPreferences({
  app: {
    name: 'DomainDeck',
    accessMode: 'frontend',
    authPageLayout: 'panel-right',
    defaultHomePath: '/overview',
    defaultAvatar: '/logo.svg',
    enableCheckUpdates: false,
    enablePreferences: false,
    enableRefreshToken: false,
    layout: 'sidebar-nav',
    locale: 'zh-CN',
    loginExpiredMode: 'page',
    contentCompact: 'wide',
    dynamicTitle: true,
  },
  breadcrumb: {
    enable: false,
    showHome: false,
    showIcon: false,
  },
  copyright: {
    companyName: 'DomainDeck',
    companySiteLink: '',
    date: '2026',
    enable: false,
    icp: '',
    icpLink: '',
    settingShow: false,
  },
  footer: { enable: false },
  header: { enable: true, height: 56, mode: 'fixed', menuAlign: 'start' },
  logo: {
    enable: true,
    source: '/logo.svg',
    showText: true,
    logoMode: 'icon',
    fit: 'contain',
  },
  navigation: { accordion: true, split: false, styleType: 'rounded' },
  sidebar: {
    width: 232,
    collapsed: false,
    collapsedShowTitle: false,
    draggable: false,
  },
  tabbar: {
    enable: true,
    styleType: 'chrome',
    showIcon: true,
    showMaximize: false,
    showRefresh: true,
    showMore: true,
    persist: true,
  },
  theme: {
    mode: 'light',
    colorPrimary: 'hsl(221 83% 53%)',
    radius: '0.625',
    fontSize: 16,
    semiDarkSidebar: true,
    semiDarkSidebarSub: false,
    semiDarkHeader: false,
  },
  transition: { loading: true, progress: true, name: 'fade-slide' },
  widget: {
    globalSearch: true,
    lockScreen: false,
    notification: false,
    refresh: true,
    sidebarToggle: true,
    themeToggle: true,
    fullscreen: false,
    languageToggle: true,
    timezone: false,
    logoutButtonPosition: 'user-dropdown',
  },
});
