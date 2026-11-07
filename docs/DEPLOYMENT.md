# 部署、更新与数据保护

## 安装

需要 Linux/systemd，应用使用 Node.js 24 的 SQLite 内置模块，不需要 npm 依赖安装。解压官方 Release 后运行 `sudo bash deploy/install.sh`。beta.4 起，安装器检测现有 Node 24（包含宝塔安装目录），缺失时下载官方固定版本 24.22.2，以内置的 x64/ARM64 SHA-256 校验后仅提取 Node 可执行文件。独立运行时安装在 `/opt/domaindeck-node/runtime/node`，不覆盖系统 Node。默认端口为 4781，与历史 Go 版本的 4780 分开。

下载需要公网访问 nodejs.org，系统需提供 curl、CA 证书、tar、gzip、sha256sum。Ubuntu/Debian 可用 `apt-get install -y curl ca-certificates tar gzip coreutils`；RHEL 系列使用对应包管理器。官方 Node 24 要求 glibc >= 2.28 和兼容的 libstdc++；运行时不可用会中止，不切换应用或修改原数据。CentOS 7 等过旧系统需要升级系统。

```sh
# 自动寻找或下载独立运行时
sudo bash deploy/install.sh
# HTTPS 反向代理部署：填写浏览器实际访问的站点地址
sudo bash deploy/install.sh --public-origin https://deck.example.com
# 指定宝塔已有的 Node 24，禁止下载
sudo bash deploy/install.sh --node /www/server/nodejs/v24.22.2/bin/node --no-download
# 只检查现有运行时，不下载或修改文件
bash deploy/install.sh --check
```

安装器验证 Node 主版本和内存 SQLite 实例后才写入应用，systemd 使用绝对运行时路径，关闭自动端口切换；启动后检查健康接口版本及服务活跃状态，失败返回非零并提示 journalctl。容器中没有正在运行的 systemd 时应直接运行 `node src/cli.js` 并挂载持久化数据目录。

服务名称 `domaindeck-node`，运行用户 `domaindeck-node`。程序目录 `/opt/domaindeck-node/current` 指向一个版本目录。数据库、加密密钥和随机初始密码在 `/var/lib/domaindeck-node`。随机密码不打印在日志内，文件权限 0600。

必须一起备份 `domaindeck.sqlite` 与 `vault.key`；丢失密钥将无法恢复注册商或通知凭据。存在任何加密配置而密钥缺失时，程序拒绝启动，不生成替代密钥。关闭服务后复制整个数据目录是最简单的完整备份方式。不要公开数据目录或初始密码文件。仅支持单进程使用一个数据目录。

```sh
sudo systemctl stop domaindeck-node
sudo cp -a /var/lib/domaindeck-node /var/lib/domaindeck-node-backup
sudo systemctl start domaindeck-node
```

## 宝塔 / Nginx 反向代理与登录

如果登录返回 `Cross-origin request rejected`，说明请求在密码校验前被拒绝。常见原因是代理将上游 Host 改成 `127.0.0.1:4781`，但浏览器 Origin 是公开域名。无需重置密码或重新初始化数据库。

在宝塔的网站反向代理配置中，目标设为 `http://127.0.0.1:4781`，发送域名保持浏览器访问的域名。对应 Nginx 配置如下，修改后检查配置并重载：

```nginx
location / {
    proxy_pass http://127.0.0.1:4781;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

beta.5 起推荐同时通过安装参数 `--public-origin https://deck.example.com` 明确允许的浏览器地址。必须与地址栏的协议、域名和非默认端口一致，只能设置一个站点地址，不带页面路径、查询或片段。应用不会因为任意 `X-Forwarded-Host` / `Forwarded` 头而放行。配置后仅该 Origin 被允许，其他站点仍返回 403；没有 Origin 的健康检查和命令行 API 请求仍按现有认证规则处理。

安装参数写入 root 所有的 `/etc/domaindeck-node.env`（0600），systemd 每次启动读取；重装时不传 `--public-origin` 会保留已有文件，在线更新同样保留。已有 beta.4 服务也可先修正代理 Host，或安装 beta.5 后配置站点地址。手工设置示例（替换为实际地址，HTTPS 站点不要填 HTTP；如文件已有其他自定义变量，请编辑文件保留它们）：

```sh
sudo install -m 600 -o root -g root /dev/null /etc/domaindeck-node.env
printf '%s\n' 'DOMAINDECK_PUBLIC_ORIGIN=https://deck.example.com' | sudo tee /etc/domaindeck-node.env >/dev/null
sudo systemctl restart domaindeck-node
```

手工启动可用 `DOMAINDECK_PUBLIC_ORIGIN=https://deck.example.com node src/cli.js`，或传入 `--public-origin https://deck.example.com`。非法配置在创建数据目录前拒绝启动。未配置时，代理必须保留 Host，继续按浏览器 Origin 的主机与请求 Host 一致进行检查；兼容 HTTPS 终止代理。不添加跨站 CORS 通配符，也不要移除 Origin 检查。

## 旧版迁移

新安装不会读取历史 `data/`。保留旧服务和备份，先添加服务商凭据并执行同步，再导入需要的手工域名 JSON。导入格式为数组或 `{ "domains": [{ "name": "example.com", "expiresAt": "2030-01-01", "notes": "" }] }`。重复域名忽略，不覆盖已存在资产。单次最多 5000 条且请求不超过 1 MiB。

验证域名列表、权限和解析记录后再切换 HTTPS 反向代理目标。DNS 写入会实际提交服务商；测试本地 UI 时不应使用有生产写权限的密钥。服务商 API 账户实际可用性需要部署者验证。

### 完整 JSON 快照导入

beta.2 提供离线迁移工具。先停止旧服务，复制整个旧数据目录生成一致的只读快照；旧服务可在复制完成后继续使用。迁移时读取快照，不对原来的数据目录运行写操作。目标必须是不存在的新目录，不能将新目录设在源快照内。示例：

```sh
node scripts/import-legacy.js /safe/legacy-snapshot /safe/new-node-data
DOMAINDECK_DATA=/safe/new-node-data HOST=127.0.0.1 PORT=4781 npm start
```

工具读取 `users.json`、`roles.json`、`config.json`、`payments.json`、`orders.json`、`notifications.json`、`audit.json`、可选 `domains.json` 和 `providers/*.json`。兼容旧 scrypt 散列并保留账户密码；迁入基础及附加角色、资料、接入（包括 Porkbun `apiSecret` 字段转换）、默认接入、支付台账、订单和通知配置。旧单独的 Spaceship/Cloudflare 配置也转为接入。支付卡号只迁移末四位，不导入 CVV。密钥写入新目录 `vault.key`，凭据加密存储。未知密码散列、重复用户名、缺失管理员或无效服务商配置导致事务失败，拒绝静默重置账户。

不迁移旧登录 token 和内存缓存。beta.3 额外读取 `notify-state.json`，迁入发送日志和成功提醒去重键，避免切换后立即重复提醒；日志只保留结果，不复制可能含秘密的旧错误文本。旧用户按原权限码迁入，不额外增加 viewer 默认权限；订单保留支付台账关联、备注和官方状态。源快照没有域名文件时，进入接入页同步获取资产，再补充手工资产。迁移后计费开关及自动通知保持关闭；先检查用户、权限、服务商和提醒配置，再按需启用。整个过程的测试只使用虚构快照，没有替你迁入真实数据。

systemd 部署时，先安装服务并停止，将新安装的空数据目录改名备份，再以新目录作为迁移目标，最后调整所有者并启动。以下路径是示例，请将快照路径替换为实际备份：

```sh
sudo systemctl stop domaindeck-node
sudo mv /var/lib/domaindeck-node /var/lib/domaindeck-node-before-import
sudo node scripts/import-legacy.js /safe/legacy-snapshot /var/lib/domaindeck-node
sudo chown -R domaindeck-node:domaindeck-node /var/lib/domaindeck-node
sudo systemctl start domaindeck-node
```

如果迁移失败，目标新目录会清理；保留原目录备份以便恢复。不要覆盖已有的 `before-import` 备份。程序包中的迁移脚本从解压后的发布包运行；在线更新 bundle 只包含运行程序，不包含迁移脚本。

## 计费、通知与服务商限制

注册、续费和转入默认不可扣款，在设置中明确启用后仍需报价和二次确认。金额对应所选年限；不支持的年限报价拒绝提交，不从一年价格猜测 Spaceship 多年价格。Porkbun 使用整数美分提交成本。唯一请求 ID 持久化，重复请求返回原订单；同域名/接入/操作存在未确认订单时拒绝创建新请求。网络超时并不代表没有扣款，需核对官方账单后在订单页人工处理。

报价核对不能代替官方结算上限。Spaceship 文档说明促销配额变化可能导致最终价格高于报价，交易接口也没有最高扣款额字段；需要严格金额上限时请在官方后台完成购买。续费前从官方获取最新到期时间，避免使用本地手工修改的日期。

本地支付方式只记账，不会替换官方付款方式。Cloudflare Registrar API 检查价格后可提交一年期新注册；支持域名转入，但要求同账户存在已激活 Zone 且 DNSSEC 已关闭。转入价格未由 Cloudflare API 暴露，确认框会说明默认付款方式扣款、实际费用未知和成功后不可退款。需开启 Registrar 权限、默认联系人及有效支付资料；续费、联系人修改仍在官方后台完成。Spaceship 账单使用本地登记；具体支持能力见 [对照表](PARITY.md)。

通知页支持七种渠道，按类型展示表单字段；秘密留空保留旧密钥。API 只回显主机、收件人等非秘密字段；切换渠道类型会清除旧类型配置。SMTP 使用 465/TLS 或 587/STARTTLS，验证证书；Webhook 和自定义注册商只能使用公网 HTTPS 443。自动提醒每小时检查，按域名、到期时间、阈值和渠道持久化去重；发送成功才标记已发送。`POST notifications/run` 可用 `force:true` 明确重新发送，普通界面检查仍去重。测试按钮会实际发送。

## 在线更新

**从 beta.1–beta.5 首次升级到 beta.8，必须下载完整程序包重新运行 `deploy/install.sh`。** 旧更新器只认识三个固定静态文件，不能接收 Vben 多文件 bundle。服务器安装不编译前端，完整包内已含构建结果。保留原数据目录与 `/etc/domaindeck-node.env`；请先停服备份数据。本版启动时事务升级 schema 6，降级需要同时恢复匹配的旧数据库。

后台「版本与设置」检查 `logdns/DomainDeck` 的 Node 3.x Release。仅同意 GitHub 返回的 SHA-256 摘要，缺少摘要或不匹配时拒绝更新。仅允许 HTTPS GitHub 及其发布资源域的下载和重定向。

本版更新 bundle 允许 `src/*.js`、`package.json` 和受限 `public` 静态资源路径（js/jse/css/assets）；拒绝目录穿越、重复路径、非规范 base64、不一致版本、缺失入口引用和超限内容。写入新版本目录前校验摘要，更新前生成一致的 SQLite 备份，然后原子切换 `current` 软链接。服务优雅退出，由 systemd 自动重启。数据和 vault key 留在原路径。

当前测试版不包含自动健康回滚。若新版启动失败，使用旧版本软链接回滚；如发生 schema 变更需同时恢复对应数据库备份：

```sh
sudo systemctl stop domaindeck-node
ls -lt /opt/domaindeck-node/releases
sudo ln -sfn /opt/domaindeck-node/releases/OLD_VERSION_DIRECTORY /opt/domaindeck-node/current
# 仅在需要降级 schema 时，将匹配的 before-update-*.sqlite 恢复为 domaindeck.sqlite。
sudo systemctl start domaindeck-node
sudo journalctl -u domaindeck-node -n 100
```

手工 `npm start` 不会自动重启，因此不提供在线替换按钮。Linux 实机 systemd 安装尚需部署者验证；CI 覆盖安装脚本语法、程序初始化、HTTP 入口、打包和更新路径。
