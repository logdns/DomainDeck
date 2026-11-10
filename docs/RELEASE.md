# DomainDeck 3.0.0-beta.12

- 新增 Ant Design Pro 风格工作台模板，可从顶部「界面模板」切换；经典 Vben 与 Board UI 模板继续保留。
- Pro 工作台包含个性化欢迎区、域名与到期统计、DNS 区域指标、到期列表、活动记录和按权限过滤的快捷入口；桌面、手机、深色模式和中英文共用既有 Vben 偏好与路由。
- 修复无 `dns:read` 权限时 Pro 欢迎区仍显示 DNS 区域总数、指标说明仍展示活动区域数量的问题。
- 扩展只读角色浏览器回归，验证 DNS 导航及区域统计不可见；增加 Pro 桌面和手机截图作为 CI 证据。

## 安装和升级

下载 `DomainDeck-node-linux.tar.gz` 与 `SHA256SUMS.txt`，核对摘要后解压并运行 `sudo bash deploy/install.sh --public-origin https://你的实际域名`。beta.8–beta.11 的 systemd 安装可通过后台「检查更新」下载校验并确认升级。手动运行请用完整包重新运行安装器。升级前备份 `/var/lib/domaindeck-node`；安装器保留账户、数据库、密钥和公开站点配置。本版无数据库 schema 变更。

## 验证和审计范围

GitHub Actions 对前端执行类型检查、单元测试和生产构建；对后端执行 x64/ARM64 测试、安装器检查、打包与摘要校验；Chromium 验证登录、业务页面、三种模板、桌面/手机、明暗主题、中英文、只读权限、更新流程及 Pro DNS 权限边界。

本次专项安全复核限于新增 Pro 模板及其与既有权限、路由、Pinia 和同源 API 的交互，不是全代码库独立完整审计。浏览器使用虚构账户与模拟服务商；真实扣费、外发通知、实机 systemd 自启和生产反向代理不属于模拟测试结果。完整范围和约束见 [安全说明](SECURITY.md)。
