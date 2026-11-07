# DomainDeck 3

独立重构的 **Node.js 24 + SQLite** 域名工作台。无 npm 运行依赖、无需前端编译，包含蓝色品牌、大字体、响应式布局、中英文和深色模式。

这是 `3.0.0-beta.5` 公开测试版，迁入旧版账户与角色、域名交易、DNS、支付台账、通知、自定义注册商和离线数据迁移。本版增加明确的公开站点地址配置，解决宝塔 / Nginx 改写 Host 后登录被拒绝的问题，保留跨站保护与独立 Node 24 安装流程。请先用独立数据目录试用，再切换生产反向代理。各项能力、服务商限制和验证依据见 [旧版功能对照](docs/PARITY.md)。

## 功能

- 随机初始密码，账户资料、改名、改密、重置、停用和删除；管理员/只读基础角色及附加角色权限矩阵；权限变化撤销会话。
- Porkbun：分页同步、DNS 增删改、报价、注册/续费/转入、NS、自动续费、转入状态、账单与余额读取。
- Cloudflare：分别同步 DNS 区域和 Registrar 注册域名，DNS 增删改、清缓存、报价、自动续费/转移锁、账单与支付资料读取；注册/手动续费仍需在官方后台完成。
- Spaceship：按 [官方文档](https://docs.spaceship.dev/) 使用 `X-API-Key`、`X-API-Secret`；支持分页域名/DNS、DNS 新增删除、联系人、注册/续费/转入、NS、自动续费、授权码、转移锁与异步操作状态。
- GoDaddy、Namecheap 声明式接入预设及 JSON/XML 自定义服务商，禁止脚本执行和私网请求。
- 计费默认关闭；下单需确认报价与年限、唯一请求 ID；结果不确定的订单保留待核对状态，阻止自动重复扣款。
- 支付记账、默认条目、订单人工核对与异步状态同步；本地条目不会替换服务商实际扣款方式，不存储完整卡号/CVV。
- 邮件、Telegram、企业微信、Bark、飞书、钉钉和自定义 Webhook；每小时检查到期提醒，持久化去重、续费通知、测试和发送日志。
- 手工资产、搜索、到期/自动续费筛选、排序、备注编辑、JSON 导入导出和 CSV 导出，以及按权限返回的统计与操作审计。
- 凭据和通知配置使用 AES-256-GCM 加密，SQLite 参数化查询和事务，菜单及接口均检查权限码。
- GitHub Actions 在 x64 和 ARM64 的隔离 Linux 容器内测试、打包并比较产物；标签构建成功后发布 GitHub Release。
- Linux systemd 部署、GitHub 版本检查、GitHub SHA-256 校验、数据库备份与在线替换。

## 快速开始

安装 Node.js **24**，无需 `npm install`：

```sh
npm start
```

访问 `http://127.0.0.1:4780`。初始用户名为 `admin`，从 `data-node/initial-admin-password` 读取随机密码。登录后在「账户权限」修改密码，密码文件会自动删除。数据目录与文件仅当前系统用户可读。

配置环境变量：`DOMAINDECK_DATA`（默认 `./data-node`）、`HOST`（默认 `127.0.0.1`）、`PORT`（默认 `4780`）、`DOMAINDECK_PUBLIC_ORIGIN`（可选，浏览器实际访问的 `https://域名[:端口]`）。生产部署使用 HTTPS 反向代理，默认不直接公开监听端口。

命令行支持 `-data DIRECTORY`、`-addr 127.0.0.1:4780`、`-open`、`-auto-port=false`、`-version`，也接受双横线和 `=value` 形式。端口 `0` 自动选择空闲端口；回环端口冲突最多尝试后续 20 个端口，公共地址不自动切换端口。`-open` 调用系统浏览器，服务继续运行在终端中。启动地址写入数据目录的 `domaindeck.log`，不记录密码或业务请求。

无需真实凭据的隔离演示：

```sh
node src/cli.js --demo --addr 127.0.0.1:0 --open
```

演示使用独立临时目录、随机密码和模拟 Spaceship/Porkbun/Cloudflare 接入。按终端提示读取密码；模拟交易不连接外部服务，DNS 外部查询、实际发信与在线更新禁用。可以用 `--data NEW_DIRECTORY` 指定全新目录，已有目录会拒绝打开。演示资产无法替代真实服务商验证。

## Linux 安装和常驻

从 [Releases](https://github.com/logdns/DomainDeck/releases) 下载 `DomainDeck-node-linux.tar.gz` 和 `SHA256SUMS.txt`，核对摘要后：

```sh
sha256sum --check --ignore-missing SHA256SUMS.txt
mkdir domaindeck-node
tar -xzf DomainDeck-node-linux.tar.gz -C domaindeck-node
cd domaindeck-node
sudo bash deploy/install.sh
sudo systemctl status domaindeck-node
sudo cat /var/lib/domaindeck-node/initial-admin-password
```

安装器需要 Linux/systemd、root。自动寻找可用的 Node.js 24（包括宝塔 `/www/server/nodejs/v24*/bin/node`）；未找到时从 nodejs.org 下载固定版本 **24.22.2** 并核对内置 SHA-256，支持 Linux x64/ARM64。不更改系统 Node 或宝塔其他应用。运行时固定放在 `/opt/domaindeck-node/runtime/node`。下载需要 curl、CA 证书、tar、gzip、sha256sum；官方二进制需要 glibc >= 2.28 和兼容的 libstdc++。

可指定 Node：`sudo bash deploy/install.sh --node /www/server/nodejs/v24.22.2/bin/node`。离线安装使用 `--node /path/to/node24 --no-download`；`bash deploy/install.sh --check` 只检查现有运行时，不下载、不写文件。

使用 `/opt/domaindeck-node`、`/var/lib/domaindeck-node` 和独立服务 `domaindeck-node`，监听 `127.0.0.1:4781`。启动检查通过才报告成功，端口占用会报错而不更换端口。关闭浏览器和 SSH 后服务继续运行，开机自动启动。

服务使用独立复制的 Node 二进制；指定 nvm/宝塔路径时先验证版本和 SQLite 功能再复制。反向代理目标为 `http://127.0.0.1:4781`，保留原始 `Host`，启用 HTTPS；不需要 CORS。宝塔部署推荐 `sudo bash deploy/install.sh --public-origin https://你的域名`，协议和端口必须与地址栏一致；配置写入 `/etc/domaindeck-node.env`，重装时不传该参数会保留。登录提示 `Cross-origin request rejected` 时先检查代理发送域名与公开地址，不需要重置密码；完整配置见 [部署说明](docs/DEPLOYMENT.md#宝塔--nginx-反向代理与登录)。

## 更新与迁移

见 [部署与迁移](docs/DEPLOYMENT.md) 和 [发布说明](docs/RELEASE.md)。后台「版本与设置」检查并安装后续 Node 3.x 版本。测试版频道可以看到 beta；稳定版只看到稳定发布。更新不会覆盖旧 Go 服务和数据。

旧版域名 JSON 可通过「域名资产 → 导入 JSON」迁入。完整 JSON 数据快照可使用 `node scripts/import-legacy.js OLD_SNAPSHOT NEW_DIRECTORY` 离线导入，保留兼容的账户密码散列、角色、接入、支付台账、订单与通知配置；服务商和通知密钥加密写入 SQLite。目标必须是不存在的新目录，失败时回滚，不覆盖已有部署。详见 [迁移说明](docs/DEPLOYMENT.md)。升级后的计费与自动通知保持关闭，需核对后启用。

## 开发与隔离验证

`npm test` 运行内置测试。`npm run build` 生成通用 Linux 源码包、在线更新 bundle 和 SHA-256；x64 和 ARM64 共用同一份源码，运行需要 Node.js 24。

严格隔离验证使用预先准备的 Node 24 镜像：

```sh
docker run --rm --pull=never --network none --read-only --user 65534:65534 \
  --cpus 2 --memory 512m --pids-limit 80 --cap-drop ALL \
  --security-opt no-new-privileges --ulimit nofile=128:128 \
  --ulimit fsize=16777216:16777216 \
  --tmpfs /scratch:rw,exec,nosuid,nodev,size=128m,mode=1777 \
  --tmpfs /dev/shm:ro,size=1m \
  --mount "type=bind,src=$(pwd),dst=/src,readonly" \
  --workdir /src --entrypoint /usr/bin/env node:24-bookworm-slim \
  -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/scratch TMPDIR=/scratch \
  /usr/bin/timeout 90s /usr/local/bin/node --test
```

在此目录运行命令。测试禁用外网，使用空环境、只读源码和工具链，只有有容量上限的临时 scratch 可写。所有服务商测试使用模拟响应，不访问真实账户。

## 安全与发布边界

见 [专项安全检查](docs/SECURITY.md)。公开仓库只含新的 Node 代码、测试、文档和流水线；没有旧工程、运行数据、密钥、截图、开发环境文件或第三方前端源码。本项目当前未授予开源许可证，公开可读不代表授予额外使用许可。
