# DomainDeck 3.0.0-beta.2

Node.js 24 + SQLite 的旧版功能迁移测试版，无 npm 依赖、无需前端编译。

- 迁入注册、续费、转入、NS、自动续费、授权码、转移锁、报价与异步订单状态。支持范围按服务商公开 API 限制。
- 补全 Spaceship 官方 API，包含联系人和 DNS 新增/删除；Porkbun 保留域名、DNS、交易、余额与账单；Cloudflare 分离 DNS 区域与 Registrar 域名，并修正报价为 POST。
- 增加 JSON/XML 声明式服务商及 GoDaddy、Namecheap 预设；自定义目标只允许公网 HTTPS，解析后固定 IP，拒绝重定向。
- 迁入七种通知渠道、到期检查、持久化去重、续费提醒和发送日志；SMTP 强制 TLS/STARTTLS。
- 增加支付记账、默认条目、订单核对、附加角色权限矩阵、密码重置、域名筛选/排序/备注和 CSV 导出。
- 新增离线 JSON 数据迁移工具：空目录导入、事务回滚、兼容旧 scrypt 散列、加密密钥，不读取现有部署数据。
- 新的计费保护：默认关闭，核对年限和总报价后显式确认；持久化唯一请求 ID，未确认订单阻止再次下单。

## 下载与使用

`DomainDeck-node-linux.tar.gz` 是两种架构通用的程序源码包，需要 Node.js 24。解压后 `sudo bash deploy/install.sh`，服务监听 127.0.0.1:4781。初始管理员 `admin`，密码位于 `/var/lib/domaindeck-node/initial-admin-password`。

`DomainDeck-node.bundle.json` 供后台在线更新使用。`SHA256SUMS.txt` 用于完整性校验。beta.1 可直接更新，启动时事务升级 schema，已有账户及加密接入不重置。降级需同时恢复更新前数据库备份。

## 已知边界

仍为 beta，不会自动覆盖现有 Go 部署；完整功能对照见 `docs/PARITY.md`。服务商、扣款和通知使用模拟数据测试，未执行真实扣款、真实密钥测试或生产 systemd 部署。Spaceship DNS 修改通过新增替代记录后删除旧记录完成；Cloudflare 购买需官方后台；Spaceship 没有公开支付方式/账单 API，使用本地台账。完整卡号和 CVV 不迁移。旧版可配置任意更新 Feed 改为固定 GitHub Node 3.x 频道，旧 API 的数据形状及旧前端不保证兼容。无自动健康回滚，也不宣称完成独立全面安全审计。
