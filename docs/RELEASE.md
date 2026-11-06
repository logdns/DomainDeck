# DomainDeck 3.0.0-beta.1

首个 Node.js 24 + SQLite 公开测试版，独立于历史 Go 架构。

- 新管理界面：蓝色品牌、大字体、手机布局、深色与中英文。
- 随机管理员初始化、用户名/密码修改、管理员/只读角色、会话撤销。
- Porkbun 域名同步及 DNS 管理；Cloudflare 区域同步及 DNS 管理；Spaceship 域名同步及 DNS 查看。
- 手工域名、搜索、导入导出、到期统计和操作审计。
- 加密凭据、参数化 SQL、事务迁移、受限请求和登录限流。
- Linux/systemd 独立常驻安装，GitHub Release 版本检查和校验后在线更新。
- GitHub Actions 在 Linux x64、ARM64 隔离测试并比较发布产物。

## 下载与使用

`DomainDeck-node-linux.tar.gz` 是两种架构通用的程序源码包，需要 Node.js 24。解压后 `sudo bash deploy/install.sh`，服务监听 127.0.0.1:4781。初始管理员 `admin`，密码位于 `/var/lib/domaindeck-node/initial-admin-password`。

`DomainDeck-node.bundle.json` 供后台在线更新使用。`SHA256SUMS.txt` 用于完整性校验。

## 已知边界

这是 beta，不会自动覆盖现有 Go 部署。旧账户和密钥需重新配置，域名支持 JSON 导入；历史自定义服务商、通知、账单、购买/续费/转移尚未迁入。Cloudflare 同步 DNS 区域，不查询 Registrar 报价；Spaceship DNS 当前只读。服务商测试使用模拟响应，未用真实账户确认。专项安全检查不等同于完整外部审计。当前版本不含更新失败后的自动健康回滚；保留旧代码目录与数据库备份供手工恢复。
