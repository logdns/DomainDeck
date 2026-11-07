# DomainDeck 国际化

这里加载应用文案，并同步 Ant Design Vue、日期等组件的语言。产品文案放在 `langs/zh-CN/deck.json` 和 `langs/en-US/deck.json`。

- 使用 `deck.nav`、`deck.description`、`deck.common` 与具体业务命名空间，避免重复定义相同按钮文案。
- 两种语言的键与 `{count}` 等插值参数必须一致；新增文案同时更新两份文件。
- JSON 使用嵌套对象，不使用包含点号的扁平键。例如 `deck.actions.dns.update` 对应 `actions → dns → update`。
- 路由 `meta.title` 保存翻译键，说明放在 `meta.descriptionKey`；列标题在 `computed` 中调用 `$t`，保证切换语言后更新。
- 日期和数字使用当前 locale 格式化；域名、厂商名和用户输入保持原文，不尝试翻译服务端错误。
- 当前覆盖主导航、标题/说明、登录、概览和域名主列表；部分历史配置表单、操作提示与详情弹窗仍为中文。

在 monorepo 根目录执行 `pnpm exec vitest run apps/web-antd/src/utils/__tests__/locales.test.ts`，检查双语键、插值及嵌套约定。
