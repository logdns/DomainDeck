# DomainDeck

域名、DNS 和注册商管理工作台。当前版本 **3.0.0-beta.10**，使用 **Node.js 24 + SQLite + Vue Vben Admin 5.8**，支持蓝色主题、大字体、深色模式、手机布局和权限菜单。发布包已包含编译后的界面，服务器无需安装前端依赖。

## 功能

- 资产概览、到期筛选、搜索、手工登记、JSON 导入和 CSV 导出。
- Spaceship、Porkbun、Cloudflare 接入；GoDaddy、Namecheap 预设及 JSON/XML 自定义服务商。
- 接入时直接展示官方凭据入口、逐步获取方法、最小权限、IP 白名单和字段说明。
- 域名查询、报价、注册、续费、转入和订单核对；按服务商实际 API 能力开放。
- DNS 区域与记录管理、Cloudflare 缓存清理；DNS 和注册商用途分别授权。
- 账户、角色、审计、支付台账和七种通知渠道；计费与自动通知默认关闭。
- 后台检查 GitHub 新版本、自动下载校验、确认安装、备份数据库并重启。

Cloudflare Registrar 不提供 WHOIS 或转入报价；GoDaddy 当前模板使用 Classic Key/Secret 而非 v3 PAT。详细能力和开通要求见 [服务商接入](docs/PROVIDERS.md)。

## Linux 安装

支持 Linux x64 / ARM64、systemd；官方 Node 运行时要求 glibc ≥ 2.28。下载 [最新发布包](https://github.com/logdns/DomainDeck/releases/tag/v3.0.0-beta.10) 中的 `DomainDeck-node-linux.tar.gz` 和 `SHA256SUMS.txt`，放在同一空目录：

```sh
sha256sum --check --ignore-missing SHA256SUMS.txt
mkdir domaindeck
tar -xzf DomainDeck-node-linux.tar.gz -C domaindeck
cd domaindeck
sudo bash deploy/install.sh --public-origin https://deck.example.com
sudo systemctl status domaindeck-node
sudo cat /var/lib/domaindeck-node/initial-admin-password
```

把 `https://deck.example.com` 换为浏览器实际访问地址，并配置 HTTPS 反向代理到 `http://127.0.0.1:4781`，保留原始 Host。用户名 `admin`，密码为首次安装随机生成的文件内容。首次登录后改密并删除初始密码文件；不要重新初始化已有数据。

安装器寻找现有 Node.js 24；没有时从 nodejs.org 下载固定版本并核对内置 SHA-256，不覆盖系统 Node。离线安装使用 `--node /path/to/node24 --no-download`。运行时检查使用 `bash deploy/install.sh --check`。

| 内容 | 默认位置 |
| --- | --- |
| systemd 服务 | `domaindeck-node` |
| 当前程序 | `/opt/domaindeck-node/current` |
| 数据、密钥、初始密码 | `/var/lib/domaindeck-node` |
| 公开站点配置 | `/etc/domaindeck-node.env` |

备份时停服复制整个数据目录，必须同时保留 SQLite 数据库和 `vault.key`。安装、代理登录排错及恢复步骤见 [部署说明](docs/DEPLOYMENT.md)。

## 接入和更新

进入「服务商」→「添加该服务商」，先阅读展开的凭据与权限指引，再填写密钥，保存后测试并同步。只做 DNS 时仅选择 DNS 用途。测试通过不代表具有全部写入或扣费权限；服务商自己的支付资料仍需在官方后台配置。

systemd 安装的管理员可在「版本与设置」点击「检查更新」：发现新版自动下载并校验，点击「更新到版本号」并确认后才切换程序。beta.8、beta.9 可直接升级。手动启动不提供在线替换，使用完整程序包重新运行安装器。升级前备份数据，重装保留已有数据库、密钥和站点配置。

发布页仅保留 beta.8 及更新版本；历史标签和发布附件已清理，数据库迁移兼容逻辑继续保留。[本版更新说明](docs/RELEASE.md)。

## 本地开发

运行需要 Node.js 24，后端无第三方 npm 依赖。源码中的 `public/` 是构建提示页，完整 UI 需按 [前端开发说明](docs/FRONTEND.md) 构建后复制到 `public/`。

```sh
npm test
npm run build
node src/cli.js --data /path/to/new-data --addr 127.0.0.1:4781
```

无真实凭据的演示：`node src/cli.js --demo --addr 127.0.0.1:0 --open`，使用独立临时数据与模拟服务商，密码按终端提示读取。

GitHub Actions 先准备锁定依赖，再禁网执行前端类型检查、单元测试、Chromium 页面回归，以及 x64/ARM64 后端测试和构建；双架构包一致后发布。测试使用虚构账户和模拟响应，不操作真实域名或扣费。[专项安全检查与已知限制](docs/SECURITY.md)。

公开源码不包含运行数据和凭据。第三方 Vben 的 MIT 许可证及其他组件声明见 [第三方声明](docs/THIRD-PARTY.md)；本项目自有代码未另授予开源许可证。
