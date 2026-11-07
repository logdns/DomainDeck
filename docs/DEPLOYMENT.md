# 部署、更新与恢复

## 安装

支持 Linux x64/ARM64、systemd，使用 Node.js 24 内置 SQLite，服务端无需 npm 依赖。下载 Release 的完整程序包与 SHA256SUMS，校验解压后执行：

```sh
sudo bash deploy/install.sh --public-origin https://deck.example.com
sudo systemctl status domaindeck-node
sudo cat /var/lib/domaindeck-node/initial-admin-password
```

填写实际 HTTPS 地址。管理员用户名为 `admin`，首次密码随机生成、0600 文件保存，不写日志。首次登录后改密并删除初始密码文件；已有账户不会被重置。

安装器寻找 Node 24，包括宝塔目录；缺失时从 nodejs.org 下载固定的 24.22.2 并核对内置 x64/ARM64 SHA-256，只安装独立运行时，不更改系统 Node。需要 curl、CA 证书、tar、gzip、sha256sum，以及 glibc ≥ 2.28 和兼容 libstdc++。运行时不兼容时安装中止，不切换应用。

```sh
sudo bash deploy/install.sh --node /www/server/nodejs/v24.22.2/bin/node --no-download
bash deploy/install.sh --check
```

程序目录 `/opt/domaindeck-node/current` 指向版本目录；运行时 `/opt/domaindeck-node/runtime/node`；服务用户和 systemd 服务均为 `domaindeck-node`。数据位于 `/var/lib/domaindeck-node`，监听 `127.0.0.1:4781`。启动检查通过才报告成功，关闭 SSH 后仍运行，开机启用。没有 systemd 的容器请直接运行 `node src/cli.js --data /persistent/data --addr 0.0.0.0:4781`，挂载持久化目录。

## 宝塔 / Nginx 反向代理与登录

代理目标 `http://127.0.0.1:4781`，发送域名保留浏览器原始 Host：

```nginx
location / {
    proxy_pass http://127.0.0.1:4781;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

登录出现 `Cross-origin request rejected` 时，请检查 `--public-origin` 与浏览器协议、域名和端口是否一致，以及代理 Host；无需重置密码。公开地址只能配置一个，不带路径、查询或片段；不信任任意转发头，不添加通配 CORS。

安装参数保存在 root 所有的 `/etc/domaindeck-node.env`（0600），重装不传该参数则保留。手动运行使用 `DOMAINDECK_PUBLIC_ORIGIN=https://deck.example.com node src/cli.js`。未配置时要求 Origin 主机与 Host 一致。

## 备份

必须一起保存数据库与 `vault.key`。密钥丢失无法恢复加密凭据；已存在密文但缺少密钥时拒绝启动，不生成替代文件。单进程使用一个数据目录，不支持多进程共享。

```sh
sudo systemctl stop domaindeck-node
sudo cp -a /var/lib/domaindeck-node /var/lib/domaindeck-node-backup
sudo systemctl start domaindeck-node
```

备份路径必须尚不存在，保留整个目录和文件权限，不公开初始密码或密钥。

## 更新和回滚

beta.8、beta.9 的 systemd 安装可以在线升级：管理员在「版本与设置」检查更新，发现新版后自动下载到进程内存，核对 GitHub SHA-256。点击更新并确认后才备份 SQLite、写入新目录、原子切换 `current` 并重启。取消不改变程序。下载失败可重试，检查结果十分钟过期；重启会清除下载缓存。

更新源固定为 `logdns/DomainDeck` 的 Node 3.x Releases，测试频道包含 beta。手动启动不提供在线替换，使用完整包重跑安装器，保留数据目录和站点配置。更早版本首次迁入当前版本也使用完整程序包，不依赖旧更新器。

更新没有自动健康回滚。若新程序启动失败：

```sh
sudo systemctl stop domaindeck-node
ls -lt /opt/domaindeck-node/releases
sudo ln -sfn /opt/domaindeck-node/releases/OLD_VERSION_DIRECTORY /opt/domaindeck-node/current
sudo systemctl start domaindeck-node
sudo journalctl -u domaindeck-node -n 100
```

将 `OLD_VERSION_DIRECTORY` 换成实际版本目录。若需降级数据库 schema，停服后同时恢复对应的更新前数据库备份，并处理匹配的 WAL/SHM 文件；不要让旧程序打开更新后的数据库。

## 可选数据导入

域名资产页接受数组或 `{ "domains": [{ "name": "example.com", "expiresAt": "2030-01-01" }] }`，最多 5000 条/1 MiB，重复域名忽略。

完整历史 JSON 快照可离线导入新目录：

```sh
node scripts/import-legacy.js /safe/legacy-snapshot /safe/new-node-data
node src/cli.js --data /safe/new-node-data --addr 127.0.0.1:4781
```

先停止源服务并复制完整快照；目标必须不存在，且不在源目录内。工具只读快照，迁移兼容账户散列、角色、接入、支付台账、订单、通知及去重状态，失败回滚。不迁入旧会话。计费和自动通知保持关闭，核对后启用。服务商实际数据仍需接入同步；只操作经过备份的数据。

## 交易与通知

服务商开通、权限和 API 限制见 [接入指南](PROVIDERS.md)。计费默认关闭，启用后仍需报价和确认；不确定订单先在官方核对，避免重复扣款。支付条目仅用于记账，无法替换官方付款方式。测试通知会实际投递；先使用测试收件人。SMTP 仅 TLS 465/STARTTLS 587，自定义服务商与 Webhook 仅公网 HTTPS 443。

CI 验证隔离启动、登录、安装器检查、打包和更新逻辑；真实注册商交易、实机 systemd 启动及开机自启须在部署环境确认。
