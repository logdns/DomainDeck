# 旧版功能迁移对照

以旧 Go 项目 `internal/api/{auth,domain,dns,pay,system,update}.go` 注册的业务接口为清单。新系统独立使用 Node.js 24、SQLite 和浏览器原生 JavaScript，不依赖 Go 或相邻 Vue 工程。这里对照业务能力，不承诺旧前端的接口字段和 URL 完全兼容。

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
| 查询可用性、注册/续费/转入报价 | 注册/转入页；`availability`、`transfer/quotes` | 精确年限、总价计算、Cloudflare POST 方法 |
| 注册、续费、转入申请 | 注册/转入/资产管理；`register`、`domains/:id/renew`、`transfer` | 计费开关、报价确认、幂等、结果不明阻止重试 |
| 自动续费、NS、授权码、转移锁、官方详情 | 资产管理；`domains/:id/{autorenew,nameservers,auth-code,transfer-lock,details}` | Spaceship/Porkbun/Cloudflare 模拟请求 |
| 转入进度、异步操作进度 | 转入页与订单页；`transfer/:domain`、`operations/:id` | 订单同步测试，不提交第二次扣款 |
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

- **Spaceship**：按 <https://docs.spaceship.dev/> 的 API Key/Secret、分页、联系人、域名交易、DNS 与异步操作协议实现。202 空响应通过 `spaceship-async-operationid` 跟踪。DNS 不存在单条原位 PATCH，界面提供新增/删除；删除时不发送 `ttl`、`group` 等响应专用字段。公开 API 没有支付方式和账单列表，使用本地记账。
- **Porkbun**：保留 API Key/Secret 接入、分页域名、DNS、注册/续费/转入、NS、自动续费、余额和账单。扣款使用整型美分，在提交前再次核对价格。不虚构授权码或转移锁 API。
- **Cloudflare**：DNS zones 与 Registrar registrations 分开读取和同步。报价使用 POST；公开购买接口未接入，注册/手动续费/转入及授权码需到官方后台。账单和支付资料只读，完整卡号裁剪为末四位。
- **GoDaddy / Namecheap**：保留旧声明式模板暴露的域名、详情、续费和设置能力。Namecheap 只暴露查询和续费；GoDaddy 不开启整域覆盖式 DNS 写入或未声明的转入。报价不可验证的自定义服务商，必须额外确认按官方价格扣款。预设支持分页，自定义声明可通过 `pagination.pageSize` 和 `{page}`/`{cursor}` 扩展分页。

## 有意调整

计费确认、请求 ID 和不确定订单的防重保护始终启用。只读基础角色可附加细分权限；管理员可分配附加角色。自定义服务商/通知限制为公网 HTTPS 443，邮件仅 TLS 465 或 STARTTLS 587，不支持明文 SMTP、私网 Webhook、私网注册商或任意更新 Feed。支付条目是台账，不能替换注册商实际付款方式。旧 Go 的演示数据和桌面打包外壳未迁入生产服务。

迁移不恢复旧登录 token、通知发送历史或运行时缓存，不自动探测真实数据目录。源快照没有域名清单时，可在新服务同步接入恢复资产；未记录在文件中的旧运行时缓存无法离线还原。敏感业务功能只用夹具和模拟服务验证，没有真实扣费或发信证据。
