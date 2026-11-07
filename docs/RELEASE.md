# DomainDeck 3.0.0-beta.7

本版恢复原有 **Vue Vben Admin 5.8 + Ant Design Vue** 界面，并将它直接接到 Node.js 24 + SQLite。前端源码与锁定依赖纳入本仓库，构建不依赖相邻旧工程；原蓝色品牌、16px 正文、导航、概览卡片、主题、语言和手机布局保留。

## 修复内容

- 原页面通过 `/api/vben` 获取正确的列表、详情、角色、权限、财务和通知数据；内部仍逐条进行权限检查，保留 `/api/v1`。
- 修复退出未携带 token、失效会话触发重复退出的问题；改密及修改自己账户后重新登录，重置他人密码与修改本人密码分开。
- 接入可同步域名，记录用途、测试状态和同步时间；编辑时秘密留空保留原配置，DNS-only 接入不能下单，registrar-only 接入不能操作 DNS。
- 修复 Spaceship 可注册结果、MX/SRV/ALIAS/PTR 数据字段、DNS 替代编辑；Cloudflare SRV/CAA/TLSA/HTTPS 结构化表单正确提交。DNS-only Cloudflare 详情不再强制调用 Registrar API。
- 购买会刷新所选接入和年限的报价，再明确确认扣款；保留唯一请求 ID 和不确定订单的防重保护。
- 支付台账保留启用状态及账号字段，同步只读支付资料可在刷新后保留；通知测试正确显示成功/失败，配置不覆盖已有秘密；补上资产登记、JSON 导入和详情备注。
- Vben 静态模块、字体和图标完整进入运行包，图标离线可用；更新器支持受限嵌套资源和二进制资产，拒绝缺失入口依赖。CSV 导出防止带空白的公式前缀执行。
- 升级 Vue、Vue I18n、Axios、Vite、Zod 等依赖的安全补丁；依赖审计没有 high/critical，保留的构建工具 moderate/low 公告及隔离措施记录在 `docs/SECURITY.md`。

## 安装与升级

下载 `DomainDeck-node-linux.tar.gz` 与 `SHA256SUMS.txt`，校验后解压，在解压目录运行：

```sh
sha256sum --check --ignore-missing SHA256SUMS.txt
sudo bash deploy/install.sh --public-origin https://你的实际域名
```

公开地址的协议和端口必须与浏览器一致。服务监听 `127.0.0.1:4781`，运行时自动寻找或下载并校验 Node 24。离线安装可使用 `--node /absolute/path/to/node24 --no-download`；预检使用 `--check`。

**beta.1–beta.5 首次升级到本版必须使用完整 tar 包重新执行安装器**，旧在线更新器无法接收 Vben 多文件 bundle。保留已有账户、密码、SQLite、vault.key 和站点配置；请先停服备份整个 `/var/lib/domaindeck-node`。启动时事务升级到 schema 6，降级须恢复匹配的数据库备份。新安装管理员 `admin` 的随机密码保存在该目录的 `initial-admin-password`，已有安装不会重置密码。

`DomainDeck-node.bundle.json` 用于本版及后续版本之间的在线更新。更新依赖 GitHub SHA-256 摘要校验、数据库备份和原子链接切换；当前不提供自动健康回滚。

## 验证与边界

Actions 执行 Vben 类型检查、前端测试、生产构建、x64/ARM64 后端回归和一致打包、真实 Chromium 界面集成；测试和构建阶段禁网、只读源码并限制资源，联网只用于准备工具链和锁定依赖。Actions 的浏览器证据包含各页面与手机截图。

仍为 beta。服务商协议、交易和通知测试使用虚构账户及模拟响应，没有用生产密钥执行真实扣款或发信，也没有操作用户服务器。Cloudflare 购买仍需官方后台；Spaceship 没有公开支付方式/账单列表；Porkbun 未公开的授权码/转移锁操作不虚构。本次针对认证、权限、适配层、凭据、DNS 和发布路径做源码及回归检查，不宣称外部独立全代码库安全审计。完整边界见 `docs/PARITY.md`、`docs/SECURITY.md`。
