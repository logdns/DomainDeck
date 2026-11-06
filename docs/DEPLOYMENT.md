# 部署、更新与数据保护

## 安装

需要 Linux/systemd 和 Node.js 24（SQLite 内置模块）。包不携带 Node 运行时，不需要 npm 依赖安装。解压官方 Release 后运行 `sudo bash deploy/install.sh`。默认端口为 4781，与历史 Go 版本的 4780 分开。

服务名称 `domaindeck-node`，运行用户 `domaindeck-node`。程序目录 `/opt/domaindeck-node/current` 指向一个版本目录。数据库、加密密钥和随机初始密码在 `/var/lib/domaindeck-node`。随机密码不打印在日志内，文件权限 0600。

必须一起备份 `domaindeck.sqlite` 与 `vault.key`；丢失密钥将无法恢复注册商凭据。关闭服务后复制整个数据目录是最简单的完整备份方式。不要公开数据目录或初始密码文件。仅支持单进程使用一个数据目录。

```sh
sudo systemctl stop domaindeck-node
sudo cp -a /var/lib/domaindeck-node /var/lib/domaindeck-node-backup
sudo systemctl start domaindeck-node
```

## 旧版迁移

新安装不会读取历史 `data/`。保留旧服务和备份，先添加服务商凭据并执行同步，再导入需要的手工域名 JSON。导入格式为数组或 `{ "domains": [{ "name": "example.com", "expiresAt": "2030-01-01", "notes": "" }] }`。重复域名忽略，不覆盖已存在资产。单次最多 5000 条且请求不超过 1 MiB。

验证域名列表、权限和解析记录后再切换 HTTPS 反向代理目标。DNS 写入会实际提交服务商；测试本地 UI 时不应使用有生产写权限的密钥。服务商 API 账户实际可用性需要部署者验证。

## 在线更新

后台「版本与设置」检查 `logdns/DomainDeck` 的 Node 3.x Release。仅同意 GitHub 返回的 SHA-256 摘要，缺少摘要或不匹配时拒绝更新。仅允许 HTTPS GitHub 及其发布资源域的下载和重定向。

更新 bundle 只允许 `src/*.js`、三个固定 `public` 文件和 `package.json`；拒绝目录穿越、重复路径、不一致版本和超限内容。写入新版本目录前校验摘要，更新前生成一致的 SQLite 备份，然后原子切换 `current` 软链接。服务优雅退出，由 systemd 自动重启。数据和 vault key 留在原路径。

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
