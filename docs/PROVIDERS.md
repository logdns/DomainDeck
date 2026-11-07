# 服务商接入

在「服务商」选择目标厂商，弹窗会展开凭据获取与权限指引。新建专用凭据并按用途最小授权；编辑时秘密留空保留原值。保存后依次「测试」「同步域名」。测试成功仅证明所测接口可用，不保证购买、转入或每个域名都已授权。

## Spaceship

- [创建 API Key/Secret](https://www.spaceship.com/application/api-manager/)；填写原始值，不做 Base64 编码。[官方 API 文档](https://docs.spaceship.dev/)。
- 读取：`domains:read`、`dnsrecords:read`；修改 DNS：`dnsrecords:write`；域名设置：`domains:write`。
- 注册/续费：`domains:billing`；转入/转出：`domains:transfer`；新建联系人：`contacts:write`；异步状态：`asyncoperations:read`。
- 支持域名、DNS、联系人、交易、NS、自动续费、授权码和转移锁。DNS 修改采用新增替代记录后删除旧记录，第二步失败需刷新核对后处理。
- 购买需有效注册人联系人 ID 和官方账户支付资料。公开 API 没有支付方式或账单列表，本地台账用于记账。

## Porkbun

- [API Access 创建 Key/Secret](https://porkbun.com/account/api)，使用配对的 `pk1_…` / `sk1_…`，无需关闭双重验证。
- Domain Management → Details → API Access，为目标域名开启 API；也可按需启用 Opt In All Domains。
- Read-only/read 用于读取，`dns` 用于解析，`domains` 用于域名设置，`purchase` 用于购买交易。按需限制域名和服务器出口 IP/CIDR，普通管理无需 `funding` 权限。
- 支持域名、DNS、报价、注册/续费/转入、NS、自动续费、余额和账单；不虚构授权码或转移锁接口。
- [开通与权限说明](https://porkbun.com/llms/guides/getting-started) · [API 文档](https://porkbun.com/api/json/v3/documentation)。

## Cloudflare

- [创建自定义 API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)，不要填 Global API Key。填写同账户的 [Account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)，不是 Zone ID。
- 读取区域：Zone → Zone → Read；读取 DNS/DNSSEC：Zone → DNS → Read；修改记录另需 DNS Edit/Write；清缓存另需 Cache Purge。[权限目录](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)。
- Token 资源范围必须包含目标账户与区域。只用解析时只选 DNS 用途，无需启用 Registrar。
- 注册/转入需 [Registrar API](https://developers.cloudflare.com/registrar/registrar-api/) 可用资格、Registrar write 权限、默认联系人、注册协议及有效默认付款方式；财务读取另需对应 Billing 权限。
- [转入](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/) 前同账户 Zone 必须 active、DNSSEC disabled，原注册商解锁，多数后缀需 EPP，UK 使用 IPS Tag。
- DNS 区域与注册域名分别同步。API 不支持 WHOIS、转入报价或直接续费；转入前会要求明确确认实际费用未知。新注册仅开放 API 支持的后缀和年限。

## GoDaddy

- [创建 Production Classic Key/Secret](https://developer.godaddy.com/keys)，不要填 OTE 或新 Domains v3 PAT。
- 当前模板连接 Domains v1，使用 `sso-key`。Classic 认证已列入弃用计划，需确认账户仍有旧 API 使用资格；仅支持 v3 的账户不能靠填写 PAT 使用当前模板。
- 支持域名、可用性、续费、部分设置和 DNS 读取；不开放注册、转入及整域覆盖式 DNS 写入。
- [认证说明与版本区别](https://developer.godaddy.com/docs/api-users/auth) · [创建凭据步骤](https://developer.godaddy.com/docs/api-users/auth/how-to)。

## Namecheap

- Profile → Tools → Business & Dev Tools → Namecheap API Access → Manage，[启用生产 API](https://www.namecheap.com/support/api/intro/)；资格以官方要求为准。
- Whitelisted IPs → Edit → Add IP，白名单应用服务器的公网出口 **IPv4**，不能填浏览器电脑、内网或 IPv6 地址。
- ApiUser 填用户名，ApiKey 填生产密钥，ClientIp 填已白名单出口地址；不要混用 sandbox。该认证方式没有本站可配置的细分 Token 权限。
- 支持域名信息和续费，不开放注册、转入或 DNS 写入。[认证参数](https://www.namecheap.com/support/api/global-parameters/) · [账户设置](https://ap.www.namecheap.com/settings/tools/)。

## 自定义和交易边界

高权限操作者可导入 JSON/XML 声明式模板。只接受可信模板，网络仅允许公网 HTTPS；不执行脚本，不支持私网 API。自定义模板自行提供接入说明，不继承同名预设指引。

注册、续费、转入默认关闭；启用后仍需报价和二次确认。网络失败不代表没有扣款，结果不确定的订单需先在官方核对。支付条目只用于本地记账，不会替换注册商默认付款方式。自动测试采用模拟响应，真实凭据权限与实际扣费须在部署环境核对。
