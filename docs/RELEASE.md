# DomainDeck 3.0.0-beta.10

- 服务商接入弹窗默认展开凭据获取与权限指引，逐字段展示用途、格式和官方入口。
- Spaceship：明确读取、DNS 写入、计费、转移、联系人及异步状态权限。
- Porkbun：补充逐域名 API Access、密钥权限、域名/IP 范围与测试限制。
- Cloudflare：区分 DNS 和 Registrar 权限、Account ID 与 Zone ID，说明注册/转入条件。
- GoDaddy：标明当前 v1 模板需要 Production Classic Key/Secret，不能填写 v3 PAT；Namecheap：说明生产 API 开通及服务器出口 IPv4 白名单。
- 自定义模板文档链接只允许不含账户密码的 HTTPS URL，拒绝脚本、data 和明文 HTTP 链接。
- 重写 README 和当前接入文档，清除旧版迁移对照及历史说明；发布页仅保留 beta.8 及更新版本。

## 安装和升级

下载 `DomainDeck-node-linux.tar.gz` 与 `SHA256SUMS.txt`，核对摘要后解压并运行 `sudo bash deploy/install.sh --public-origin https://你的实际域名`。

beta.8、beta.9 的 systemd 安装可通过后台「检查更新」下载校验并确认升级。手动运行使用完整包重新运行安装器。升级前备份 `/var/lib/domaindeck-node`；安装器保留账户、数据库、密钥和公开站点配置。

## 验证范围

Actions 对 Vben 执行类型检查、单元测试和生产构建；对后端执行 x64/ARM64 测试、安装器检查、打包与摘要校验；Chromium 验证桌面、手机、五家接入指引及更新流程。新增安全回归验证自定义文档链接过滤和预设覆盖隔离。

使用虚构账户和模拟服务商；真实扣费、外发通知和实机 systemd 自启不属于模拟测试结果。本次为改动范围的专项安全检查，不等同于独立完整审计；依赖审计结果见 Actions 和 [安全说明](SECURITY.md)。
