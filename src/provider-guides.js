export const providerGuides = {
  spaceship: {
    docs: 'https://docs.spaceship.dev/',
    credentialsUrl: 'https://www.spaceship.com/application/api-manager/',
    hint: '使用 API Key + API Secret；按用途授权，注册/续费需要计费权限，转移另需转移权限。',
    setup: [
      { title: '创建专用 API Key', detail: '登录 Spaceship → API Manager → New API key。保存 API Key 和 API Secret；这里填写原始值，不要 Base64 编码。', url: 'https://www.spaceship.com/application/api-manager/' },
      { title: '同步域名与读取 DNS', detail: '勾选 domains:read（域名、可用性、价格）及 dnsrecords:read（DNS 记录）。修改 DNS 再加 dnsrecords:write；仅只读同步不需要写入或计费权限。', url: 'https://docs.spaceship.dev/' },
      { title: '按需启用设置、注册和转移', detail: '域名设置：domains:write；注册/续费：domains:billing；转入/转出：domains:transfer；新建联系人：contacts:write；查询异步交易：asyncoperations:read。注册/转入需有效注册人联系人 ID 和官方账户支付资料。', url: 'https://docs.spaceship.dev/' },
      { title: '保存后测试与同步', detail: '先点击接入卡片的「测试」，再同步域名。测试成功不代表全部写入权限可用；403 请核对对应权限码，交易权限不会被测试按钮验证。' },
    ],
    fields: {
      apiKey: { label: 'API Key', secret: true, placeholder: '粘贴 API Manager 中的 API Key', help: '与下面的 API Secret 必须来自同一对凭据。', url: 'https://www.spaceship.com/application/api-manager/' },
      apiSecret: { label: 'API Secret', secret: true, placeholder: '粘贴同一对凭据的 API Secret', help: '不要填写登录密码，不要编码；编辑接入时留空保留已有密钥。', url: 'https://www.spaceship.com/application/api-manager/' },
    },
  },
  porkbun: {
    docs: 'https://porkbun.com/api/json/v3/documentation',
    credentialsUrl: 'https://porkbun.com/account/api',
    hint: '需要成对 API Key/Secret Key、域名 API 开关，以及与操作匹配的密钥权限。',
    setup: [
      { title: '创建独立 Key 与 Secret', detail: '登录 Porkbun → Account → API Access，创建专用凭据并保存 API Key（pk1_…）与 Secret Key（sk1_…）。无需关闭账户双重验证。', url: 'https://porkbun.com/account/api' },
      { title: '给域名开启 API Access', detail: 'Domain Management → 目标域名 Details → API Access 开启。仅看到域名不代表允许操作；需要全部域名时可在 API 设置开启 Opt In All Domains。', url: 'https://porkbun.com/llms/guides/getting-started' },
      { title: '配置最小权限与来源限制', detail: '只读同步使用 Read-only/read；修改解析需要 dns，域名设置需要 domains；注册/续费/转入需要 purchase。可限制目标域名和服务器公网出口 IP/CIDR。请在官方密钥页按实际功能核对，不要为普通域名操作授予 funding。', url: 'https://porkbun.com/llms/guides/getting-started' },
      { title: '核对购买条件，再测试同步', detail: '测试仅验证凭据；若测试成功但域名操作失败，请检查该域名 API Access、域名/IP 限制与密钥权限。扣费前另需有效余额/支付方式，并在本站显式启用计费。', url: 'https://porkbun.com/api/json/v3/documentation' },
    ],
    fields: {
      apiKey: { label: 'API Key', secret: true, placeholder: 'pk1_…', help: '填写 API Access 页面生成的 API Key。', url: 'https://porkbun.com/account/api' },
      secretKey: { label: 'Secret Key', secret: true, placeholder: 'sk1_…', help: '填写与 API Key 配对的 Secret Key；不要填写账户密码。', url: 'https://porkbun.com/account/api' },
    },
  },
  cloudflare: {
    docs: 'https://developers.cloudflare.com/api/',
    credentialsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    hint: '使用 API Token + Account ID。DNS 区域与 Registrar 是两类权限，Zone ID 不能代替 Account ID。',
    setup: [
      { title: '创建 API Token', detail: '进入 API Tokens → Create Token → 自定义 Token；使用 API Token，不是 Global API Key。将资源限制到实际账户和需要管理的区域。', url: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/' },
      { title: '配置 DNS 权限和资源范围', detail: '读取区域：Zone → Zone → Read；读取解析和 DNSSEC：Zone → DNS → Read。修改解析再加 DNS → Edit/Write，清缓存另加 Cache Purge。Zone Resources 必须包含目标区域，账户范围必须与 Account ID 一致。', url: 'https://developers.cloudflare.com/fundamentals/api/reference/permissions/' },
      { title: '获取 Account ID', detail: '从控制台账户主页或域名 Overview 的 API 区域复制 Account ID（32 位十六进制）。不要复制 Zone ID，也不要填写邮箱。', url: 'https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/' },
      { title: '需要注册/转入时配置 Registrar', detail: '仅 DNS 无需开通 Registrar。注册/转入需账户 Registrar write 权限和 API 可用资格，在官方 Registrations 设置默认注册联系人、接受注册协议并配置有效默认付款方式。财务读取另需相应 Billing 权限。', url: 'https://developers.cloudflare.com/registrar/registrar-api/' },
      { title: '核对转入条件与接入用途', detail: '转入前同账户 Zone 必须 active、DNSSEC disabled，并在原注册商解锁；多数后缀需 EPP，UK 使用 IPS Tag。API 不提供转入价格。只用解析时仅勾选「DNS」用途；测试 Token 通过后仍需同步区域验证实际资源权限。', url: 'https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/' },
    ],
    fields: {
      token: { label: 'API Token', secret: true, placeholder: '粘贴已授权目标区域/账户的 API Token', help: '不要填写 Global API Key；至少配置 Zone Read 和 DNS Read，修改解析再加 DNS Write。', url: 'https://dash.cloudflare.com/profile/api-tokens' },
      accountId: { label: 'Account ID（账户 ID）', secret: false, placeholder: '32 位十六进制账户 ID，不是 Zone ID', help: '必须与 Token 的账户/资源范围一致。', url: 'https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/' },
    },
  },
  godaddy: {
    docs: 'https://developer.godaddy.com/docs/api-users/auth',
    credentialsUrl: 'https://developer.godaddy.com/keys',
    hint: '当前模板使用 Domains v1 + Classic Key/Secret，不接收 Domains v3 的 PAT；旧接口已列入弃用计划。',
    setup: [
      { title: '创建 Production Classic Developer Key', detail: '在开发者 Keys 页面创建 Production 环境的 Classic Key 和 Secret，填写成对值。当前模板使用 sso-key 和 Domains v1，不能填 PAT，也不能用 OTE 测试凭据连接生产 API。', url: 'https://developer.godaddy.com/docs/api-users/auth/how-to' },
      { title: '核对账户资格和旧接口可用性', detail: '官方新 Domains v3 使用 PAT 权限；这不等于当前 v1 模板支持 PAT。Classic Key 已列入弃用计划，生产管理资格和 403 错误需按官方账户要求核对；若账户只支持 v3，请不要重复填 Key 尝试扣费。', url: 'https://developer.godaddy.com/docs/api-users/auth' },
      { title: '先测试，再同步', detail: '当前模板提供域名读取、查询、续费和部分设置，不开放注册/转入或整域覆盖式 DNS 写入。测试不验证续费扣款能力。' },
    ],
    fields: {
      apiKey: { label: 'Production Classic API Key', secret: true, placeholder: 'Production Key，不是 PAT', help: '当前 v1 模板使用 Classic Key/Secret。', url: 'https://developer.godaddy.com/keys' },
      apiSecret: { label: 'Production Classic API Secret', secret: true, placeholder: '与上方 Key 配对的 Secret', help: 'Secret 通常只显示一次；遗失请在官方后台重新生成。', url: 'https://developer.godaddy.com/keys' },
    },
  },
  namecheap: {
    docs: 'https://www.namecheap.com/support/api/intro/',
    credentialsUrl: 'https://ap.www.namecheap.com/settings/tools/',
    hint: '需要开启生产 API Access，并白名单应用服务器公网出口 IPv4；账号用户名就是 ApiUser。',
    setup: [
      { title: '开启生产 API Access', detail: '登录 Namecheap → Profile → Tools → Business & Dev Tools → Namecheap API Access → Manage，启用后获取 API Key。生产资格以官方要求为准，不满足时联系官方支持。', url: 'https://www.namecheap.com/support/api/intro/' },
      { title: '加入服务器公网 IPv4 白名单', detail: '在 Whitelisted IPs → Edit → Add IP 填运行 DomainDeck 的服务器公网出口 IPv4。ClientIp 填同一地址；不是浏览器电脑 IP、内网 IP 或 IPv6，NAT 后需填实际出口。', url: 'https://www.namecheap.com/support/api/intro/' },
      { title: '填写 ApiUser / ApiKey / ClientIp', detail: 'ApiUser 填 Namecheap 账户用户名，ApiKey 填生产 API Key，ClientIp 填已白名单 IPv4。当前模板连接生产 XML API，不要混用 sandbox 账号或 Key。官方此认证方式不提供本站可配置的细分 Token 权限。', url: 'https://www.namecheap.com/support/api/global-parameters/' },
      { title: '测试并同步域名', detail: '当前模板支持域名信息与续费，不开放注册/转入或 DNS 写入。测试成功仅表示凭据、IP 和所测接口可用，续费仍需官方账户余额及本站计费确认。' },
    ],
    fields: {
      apiKey: { label: 'ApiUser（账户用户名）', secret: false, placeholder: 'Namecheap 用户名，不是 API Key', help: '官方 ApiUser / UserName；与 ApiKey 所属账户一致。', url: 'https://www.namecheap.com/support/api/global-parameters/' },
      apiSecret: { label: 'ApiKey', secret: true, placeholder: '生产 API Access 中的 API Key', help: '不是账户登录密码；请勿填写 sandbox Key。', url: 'https://ap.www.namecheap.com/settings/tools/' },
      clientIp: { label: 'ClientIp（白名单出口 IPv4）', secret: false, placeholder: '例如 203.0.113.10，请填写实际公网出口', help: '必须与 Namecheap 白名单和服务器实际出口 IPv4 一致。', url: 'https://www.namecheap.com/support/api/intro/' },
    },
  },
};
