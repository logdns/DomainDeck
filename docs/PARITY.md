# 旧版功能迁移对照

以旧 Go 项目 `internal/api/{auth,domain,dns,pay,system,update}.go` 注册的业务接口为清单。新版使用 Node.js 24、SQLite，以及直接迁入仓库的原 Vue Vben Admin 页面，不再依赖 Go 或相邻前端目录。`/api/vben` 对原页面的数据字段、列表结构和表单作显式兼容，内部仍经过与 `/api/v1` 相同的权限与业务检查。

| 旧版功能 | 新版入口与实现 | 自动验证 |
| --- | --- | --- |
| 登录、退出、用户信息、权限码、修改密码 | `auth/*`、`user/info`；随机会话、散列令牌、12 小时过期 | server、accounts、resources、parity 测试 |
| 用户增删改、资料、停用、密码重置 | 账户页；`accounts`、`accounts/:id/password` | 最后管理员保护、会话撤销、资料与密码测试 |
| 角色列表/权限矩阵/增删改/分配 | 角色页、账户页；`roles`、`permissions`、`accounts/:id/roles` | 权限生效、越权拒绝、角色变更撤销会话 |
| 服务商目录、预设、自定义声明校验/保存/删除 | 服务商页；`providers`、`providers/presets`、`providers/custom` | JSON 映射、XML/XXE 拒绝、依赖连接保护 |
| 接入增删改、停用、默认、测试 | 接入页；`connections`、`:id/default`、`:id/test` | 密钥保留/加密、停用禁止请求、默认唯一 |
| 全量接入测试、联系人、安全开关 | 设置页；`settings`、`settings/test`、`contacts` | 安全开关、默认联系人与官方请求形状 |
| 概览、到期统计、财务与审计可见性 | 概览页、`overview` | 统计中的财务、审计字段按权限返回 |
| 域名列表、详情、手工资产、导入导出 | 资产页；`domains`、`:id/details`、`domains/import` | 事务导入、日期校验、元数据编辑 |
| 搜索、到期/自动续费筛选、排序、CSV | 资产页；浏览器筛选导出 | 模板转义测试；CSV 公式前缀处理 |
| 查询可用性、注册/续费/转入报价 | 注册/转入页；`availability`、`transfer/quotes` | 精确年限、总价计算、Cloudflare 注册报价；Cloudflare 转入费用不由 API 提供，UI 明确提示 |
| 注册、续费、转入申请 | 注册/转入/资产管理；`register`、`domains/:id/renew`、`transfer` | 计费开关、扣费确认、幂等、结果不明阻止重试、Cloudflare Zone/DNSSEC 前置检查 |
| 自动续费、NS、授权码、转移锁、官方详情 | 资产管理；`domains/:id/{autorenew,nameservers,auth-code,transfer-lock,details}` | Spaceship/Porkbun/Cloudflare 模拟请求 |
| 转入进度、异步操作进度 | 转入页与订单页；`transfer/:domain`、`operations/:id` | Cloudflare `transfer-in-status` 状态、EPP Base64 编码、UK 无 EPP、blocked/action_required/failed 映射；订单同步不会重提扣款 |
| DNS 区域、记录查询/新增/修改/删除 | DNS 区域页及资产 DNS；`dns/zones/:id/records` | Spaceship 精确记录删除、Cloudflare PATCH、Porkbun CRUD |
| 清除 Cloudflare 缓存 | DNS 区域与资产管理；`purge` | zone 目标与请求体测试 |
| DNS 解析查询 | 解析查询页；`lookup` | 类型校验、模拟解析结果、失败提示 |
| 支付类型、台账增删改、默认与校验 | 支付页；`payment-types`、`payments`、`:id/default`、`verify` | 只接受卡末四位、禁止 CVV/完整卡号字段 |
| 支付资料同步、能力探测 | `payments/sync`、`capabilities`、`probe` | 只调用声明的官方 API，不试探未知扣款接口 |
| 订单台账、人工核对、单笔/批量同步 | 订单页；`orders`、`:id`、`sync`、`:id/sync` | 持久化请求 ID、异步状态、超时待核对 |
| 账户余额、官方账单 | 支付页；`accounts/balances`、`invoices` | 官方响应归一化、敏感卡信息裁剪 |
| 通知配置、测试、规则、执行与日志 | 通知页；`notifications`、`test`、`run`、`log` | 七渠道、失败确认、密钥加密、重复提醒抑制 |
| 审计与系统状态 | 审计页、`audit`、`system/status` | 读权限隔离、错误不回显秘密 |
| 版本状态、检查、安装更新 | 设置页；`update/*`，兼容 `system/update/*` | GitHub SHA 校验、路径校验、备份与原子切换 |
| 旧账户/角色/配置/台账/通知数据 | `scripts/import-legacy.js` | 命令行夹具导入、散列兼容、源文件不变、失败回滚 |
| 安装、常驻、开机自启 | `deploy/install.sh` | 脚本静态检查、程序启动测试；实机 systemd 待部署者验证 |

## 服务商能力边界

- **Spaceship**：按 <https://docs.spaceship.dev/> 的 API Key/Secret、分页、联系人、域名交易、DNS 与异步操作协议实现。202 空响应通过 `spaceship-async-operationid` 跟踪。DNS 编辑采用先新增替代记录、再删除原记录；第二步失败明确要求刷新后核对，避免盲目重试。删除时不发送 `ttl`、`group`；MX 使用 `preference`，ALIAS 使用 `aliasName`，PTR 使用 `pointer`，SRV 保留带下划线的 service/protocol。公开 API 没有支付方式和账单列表，使用本地记账。
- **Porkbun**：保留 API Key/Secret 接入、分页域名、DNS、注册/续费/转入、NS、自动续费、余额和账单。扣款使用整型美分，在提交前再次核对价格。不虚构授权码或转移锁 API。
- **Cloudflare**：DNS zones 与 Registrar registrations 分开读取和同步。DNS 使用官方 Zones API、zone-scoped DNS Records API 和 zone ID。Registrar API 以实时 `domain-check` 的 `registrable` 和价格字段检查，不做 WHOIS；API 支持的后缀可提交一年期新注册并轮询状态。域名转入使用官方 `transfer-in` 与 `transfer-in-status` API，提交前校验同账户 Zone 为 active 且 DNSSEC disabled；EPP 码只在内存中编码发送，不进入订单/审计日志；UK 后缀不要求 EPP。转入接口未提供价格，需在 UI 明确确认由 Cloudflare 默认付款方式扣费且完成后不可退款。续费、联系人更新仍需在官方后台操作。单独接入权限不足会在 DNS 页面明确提示。账单和支付资料只读，完整卡号裁剪为末四位。
- **GoDaddy / Namecheap**：保留旧声明式模板暴露的域名、详情、续费和设置能力。Namecheap 只暴露查询和续费；GoDaddy 不开启整域覆盖式 DNS 写入或未声明的转入。报价不可验证的自定义服务商，必须额外确认按官方价格扣款。预设支持分页，自定义声明可通过 `pagination.pageSize` 和 `{page}`/`{cursor}` 扩展分页。

## 有意调整

计费确认、请求 ID 和不确定订单的防重保护始终启用。只读基础角色可附加细分权限；管理员可选择关闭基础读取权限，使用精确的附加角色权限。自定义服务商/通知限制为公网 HTTPS 443，邮件仅 TLS 465 或 STARTTLS 587，不支持明文 SMTP、私网 Webhook、私网注册商或任意更新 Feed。支付条目是台账，不能替换注册商实际付款方式。旧 Go 的私人演示数据和桌面打包外壳不复制，新演示与系统浏览器启动入口见下文。

迁移不恢复旧登录 token 或运行时缓存，不自动探测真实数据目录。源快照没有域名清单时，可在新服务同步接入恢复资产；未记录在文件中的旧运行时缓存无法离线还原。敏感业务功能只用夹具和模拟服务验证，没有真实扣费或发信证据。

## beta.3 迁移补全

- 自定义服务商兼容 `$input`、`$fmt`、`$when`、Basic 认证字段名、日期/美分映射、XML `#text`、价格结果路径、DNS 主机名/优先级/备注、测试回退与分页总数。无报价续费有额外计费确认，未公开操作仍拒绝。
- 快照保留原权限范围、账户资料、域名状态/NS、订单支付关联、通知发送日志和成功去重状态。旧受限角色不额外获得 viewer 默认权限；普通账户管理权限不能提升或操作管理员。
- 页面补充概览财务/活动、全接入同步/测试、运行状态、支付能力、本地支付校验、单笔订单同步、权限勾选、联系人/隐私选项和通知字段表单。服务商页包含文档与密钥开通指引。
- DNS 查询支持服务标签、大小写类型及公网 DNS 服务器；域名详情也可按域名查询，Spaceship 同步保留状态与 NS 元数据。Spaceship 可切回默认 NS。
- 演示模式采用全新目录及三家模拟接入，拒绝真实外部 DNS、通知发送及更新；启动支持数据目录/地址/端口 0/自动端口/浏览器参数与启动日志。
- 桌面入口改为 Node + 系统浏览器，需要 Node.js 24，不提供旧 Go 自包含二进制壳；不复制旧私人演示数据。旧版业务接口清单均有新版入口，不保证旧 URL/数据结构完全兼容。
