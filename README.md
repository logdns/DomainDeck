# DomainDeck 3

独立重构的 **Node.js 24 + SQLite** 域名工作台。无 npm 运行依赖、无需前端编译，包含蓝色品牌、大字体、响应式布局、中英文和深色模式。

这是 `3.0.0-beta.1` 公开测试版。包含账户、会话、权限、资产、注册商、DNS 和在线更新的完整基础流程；尚未达到旧 Go 版本的全部功能覆盖。请先并行试用再切换生产反向代理。

## 功能

- 随机初始管理员密码，支持修改用户名和密码、添加管理员/只读账户，改动账户立即撤销其已有会话。
- Porkbun：连接测试、全量域名同步、到期时间、DNS 查询/增删改。
- Cloudflare：账户 DNS 区域同步、DNS 查询/增删改；区域列表不等于 Registrar 注册域名列表，不提供到期时间。
- Spaceship：按 [官方文档](https://docs.spaceship.dev/) 使用 `X-API-Key`、`X-API-Secret`，支持域名分页同步、到期时间和 DNS 查看。当前版本不写入 Spaceship DNS。
- 手工资产、搜索、JSON 导入/导出、30 天到期统计、管理操作审计。
- 凭据使用 AES-256-GCM 加密，SQLite 参数化查询和事务，服务端强制管理员/只读权限。
- GitHub Actions 在 x64 和 ARM64 的隔离 Linux 容器内测试、打包并比较产物；标签构建成功后发布 GitHub Release。
- Linux systemd 部署、GitHub 版本检查、GitHub SHA-256 校验、数据库备份与在线替换。

## 快速开始

安装 Node.js **24**，无需 `npm install`：

```sh
npm start
```

访问 `http://127.0.0.1:4780`。初始用户名为 `admin`，从 `data-node/initial-admin-password` 读取随机密码。登录后在「账户权限」修改密码，密码文件会自动删除。数据目录与文件仅当前系统用户可读。

配置环境变量：`DOMAINDECK_DATA`（默认 `./data-node`）、`HOST`（默认 `127.0.0.1`）、`PORT`（默认 `4780`）。生产部署使用 HTTPS 反向代理，默认不直接公开监听端口。

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

安装器需要 Linux/systemd、root 和预先安装的 Node.js 24；不会下载软件。使用 `/opt/domaindeck-node`、`/var/lib/domaindeck-node` 和独立服务 `domaindeck-node`，监听 `127.0.0.1:4781`，以便与旧服务并行。关闭浏览器和 SSH 后服务继续运行，开机自动启动。

Node 必须安装到服务用户可执行的系统路径（例如 `/usr/bin/node`），不使用 root 家目录内的 nvm。反向代理目标为 `http://127.0.0.1:4781`，保留原始 `Host`，启用 HTTPS；不需要 CORS。

## 更新与迁移

见 [部署与迁移](docs/DEPLOYMENT.md) 和 [发布说明](docs/RELEASE.md)。后台「版本与设置」检查并安装后续 Node 3.x 版本。测试版频道可以看到 beta；稳定版只看到稳定发布。更新不会覆盖旧 Go 服务和数据。

旧版域名 JSON 可以通过「域名资产 → 导入 JSON」迁入。为了避免导入不兼容的密码散列和明文密钥，旧账户、服务商凭据需在新后台重新配置。旧自定义注册商、账单、通知、购买/续费/转移工作流暂未迁入；当前 beta 不宣称完成这些功能。

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
  --mount "type=bind,src=$(pwd)/node,dst=/src,readonly" \
  --workdir /src --entrypoint /usr/bin/env node:24-bookworm-slim \
  -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/scratch TMPDIR=/scratch \
  /usr/bin/timeout 90s /usr/local/bin/node --test
```

在此目录运行命令。测试禁用外网，使用空环境、只读源码和工具链，只有有容量上限的临时 scratch 可写。所有服务商测试使用模拟响应，不访问真实账户。

## 安全与发布边界

见 [专项安全检查](docs/SECURITY.md)。公开仓库只含新的 Node 代码、测试、文档和流水线；没有旧工程、运行数据、密钥、截图、开发环境文件或第三方前端源码。本项目当前未授予开源许可证，公开可读不代表授予额外使用许可。
