# Vben 前端与 Node API

`frontend/` 是原工作台的 Vue Vben Admin 5.8 工作区，使用 Vue 3、Pinia、Vue Router、Ant Design Vue。Vben 官方文档：<https://doc.vben.pro/>。实际业务页面在 `apps/web-antd/src/views`，保留蓝色 token、大字体、明暗主题、语言切换、权限菜单、卡片、导航和手机布局。

## 界面模板

「界面模板」可选择 `Vben Classic`、`Board UI` 或 `Ant Design Pro`，选择保存在本机浏览器。Board UI 提供 React 工作空间外壳与资产概览；Ant Design Pro 模板参考官方 Workplace 的欢迎区、响应式指标卡、左右工作区和快捷导航布局，使用项目既有 Vue 与 Ant Design Vue 实现，不复制 Umi/React 示例工程或演示数据。Pro 模板展示真实账户资料、Pinia 概览、到期域名和权限允许的快捷入口；DNS 指标及辅助文案均按 `dns:read` 授权显示。所有模板共用 Vben 权限菜单、路由守卫、业务页面和同源 API；各模板可通过顶部选择器互相切换。

BoardUI 官方组件库面向 React 19；项目通过 `board-root.vue` 管理独立 React root，接收 Vue 的数据和回调，卸载时调用 `root.unmount()`。React 不读取登录令牌，不另建请求层，也不改变后端权限。导航来自 Vben 已授权菜单，快捷操作按权限显示；明暗和中英文仍使用 Vben 偏好设置。

`src/boardui/` 包含 MIT 免费 Button/Badge 的适配、作用域设计变量和自制工作空间模板，来源及许可证见 [第三方声明](THIRD-PARTY.md)。不含付费 Pro 模板。工作台使用真实概览数据，不生成虚构趋势；加载、失败、空资产和到期提醒有独立状态。

## 接口边界

浏览器统一请求同站点 `/api/vben`，由 `src/vben.js` 适配旧页面的列表/字段/角色/表单；适配层通过 `authorize` 逐条检查调用的内部路由，再调用现有业务服务。`/api/v1` 保留为规范化 Node API。数据库 schema 6 记录接入用途、测试结果及同步时间；配置留空保留加密凭据，列表不返回秘密。

业务模块仍按账户、接入、域名交易、DNS、财务、通知和更新分开。DNS 与注册商用途分别生效；Cloudflare DNS 区域不冒充已注册域名，跨接入同名 zone 可在详情中关联。购买前刷新选定注册商/年限报价，弹窗确认后才生成持久化幂等请求；取消不会下单。支付条目只用于记账。

## 开发构建

Node 24，pnpm 11.16.0，锁文件为 `frontend/pnpm-lock.yaml`。首次准备依赖：

```sh
cd frontend
pnpm install --frozen-lockfile --ignore-scripts
```

构建阶段可以禁网；需要可写工作副本运行 Vben 的 workspace stub：

```sh
pnpm -r --if-present run stub
pnpm --filter @vben/web-antd typecheck
pnpm exec vitest run apps/web-antd/src/utils/__tests__
pnpm --filter @vben/web-antd build
```

将 `frontend/apps/web-antd/dist/` **全部内容**复制到应用 `public/`（保留 js、jse、css、配置 JS 和图标），再运行根目录 `npm run build`。不要把整个前端源码/依赖复制到生产 `public`。根目录源码仅含构建提示页，缺少真实编译界面会拒绝打包。

开发代理保留 Host；生产 API base 是 `/api/vben`，Vite base 是 `/`，路由使用 hash。生产公开访问地址使用 Node 的 `DOMAINDECK_PUBLIC_ORIGIN`，不要在浏览器构建中写入服务商秘密。菜单图标随包提供，运行时无需访问 Iconify 网络服务。

## 隔离测试和 CI

`.github/workflows/release.yml` 将联网准备依赖与禁网执行项目代码分开。前端先类型检查、Vitest、生产构建；后端在 x64/ARM64 上运行显式 `test/*.test.js`、打包和摘要核对；Chromium 在禁网容器中验证实际界面登录、全部业务页、接入同步、支付保存/刷新、手机视口及只读路由。浏览器使用随机临时数据库和模拟服务商，截图上传至 Actions 的 `vben-browser-evidence`。

CI 比较双架构产物一致后才创建标签 Release，并保存 Board UI 与 Ant Design Pro 桌面/手机浏览器证据。只读浏览器角色不授予 `dns:read`，并验证 Pro 模板隐藏区域数量、活动区域数和 DNS 导航。不能仅因后端健康接口可达就认为界面登录或第三方账户成功；真实凭据、扣款、发信和生产反向代理仍需在自己的环境验证。
