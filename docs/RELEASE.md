# DomainDeck 3.0.0-beta.8

本版修复版本检查/安装状态、Cloudflare DNS 和 Registrar 查询，新增 Cloudflare Registrar 转入 API，以及域名后缀自动补全。

## 修复

- 版本检查保留安装器支持状态。手动运行不再显示可误点的在线替换按钮，并给出完整包升级提示。
- Cloudflare DNS 从官方 Zones API 读取区域，按 zone ID 读取记录；DNS 页面会显示区域读取失败接入和需要的 token 权限。
- Cloudflare Registrar 以 `domain-check` 返回的 `registrable` 和实时价格为准，不做 WHOIS。API 开放的后缀可检查并提交一年期新注册，采用价格复核、显式扣费确认和状态轮询。
- Cloudflare Registrar 支持转入：提交前验证同账户 Cloudflare Zone 已激活且 DNSSEC 已关闭；标准 EPP 码按 RFC 4648 Base64 传给 API，`.uk` 系列允许无 EPP 码；状态使用官方 `transfer-in-status` 接口。
- Cloudflare 转入 API 没有提供报价字段，提交前必须确认实际费用未知、Cloudflare 默认付款方式扣款且成功转入不可退款；`.uk` 系列通常无转入费。状态 `blocked` 属正常等待，`action_required` 需用户处理，`failed` 不会自动重试。
- 需用户处理或失败的 Cloudflare 订单停止批量刷新，保留待人工核对状态并拦截重复下单；处理后可主动同步单笔订单。批量订单为空时正常返回，不再误报单笔订单不存在。
- 缺少后缀的查询会补全常见后缀；下单前展示规范化后的域名。

Cloudflare Registrar API beta 需开启相应功能、Registrar 权限、默认注册联系人及付款资料。DomainDeck 不使用 WHOIS：新注册使用实时 `domain-check` 价格并在提交前复核；转入 API 未提供程序化价格，因此不会伪造金额，而在扣费确认中明确披露不确定费用。转入要求同账户 Zone 状态为 `active` 且 `/zones/{zone_id}/dnssec` 状态为 `disabled`；`.uk` 需在原注册商更新 Cloudflare IPS Tag。DNS 通过 `GET /zones?account.id=...` 找到 zone，再通过 `/zones/{zone_id}/dns_records` 读写记录；区域读取需要 Zone Read 与 DNS Read，DNSSEC 状态读取需要 DNS Read 或 DNS Write，修改记录需要 DNS Write。

官方资料：[Registrar API](https://developers.cloudflare.com/registrar/registrar-api/)、[Initiate Transfer](https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/)、[Get Transfer Status](https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in_status/methods/get/)、[DNSSEC Details](https://developers.cloudflare.com/api/resources/dns/subresources/dnssec/methods/get/)、[转入说明与费用](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/)、[API Token 权限](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)。API 只支持部分后缀；新注册仅一年期。续费与联系人维护仍需在 Cloudflare 后台处理。

## 安装

下载 `DomainDeck-node-linux.tar.gz` 和 `SHA256SUMS.txt`，校验后解压并运行：

```sh
sha256sum --check --ignore-missing SHA256SUMS.txt
sudo bash deploy/install.sh --public-origin https://你的实际域名
```

从 beta.1–beta.5 首次升级需使用完整包并运行安装器。beta.6 及之后安装的版本可用后台在线更新。升级前备份 `/var/lib/domaindeck-node`。安装器保留现有数据库、账户、密钥和站点配置。

## 验证边界

发布由 GitHub Actions 执行前后端测试、Vben 类型检查、生产构建、x64/ARM64 隔离打包和 Chromium 桌面/手机回归；服务商测试使用模拟数据，不会扣费、发信或读取真实部署数据。此版本仍处于 beta，不等同于外部独立的完整安全审计。
