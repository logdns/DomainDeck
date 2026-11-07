# DomainDeck 3.0.0-beta.9

完善后台「版本与更新」，使用 GitHub Releases 自动下载和校验更新包。

- 点击「检查更新」持续显示最新版本、发布时间、包大小与更新说明；没有新版也显示明确结果。
- systemd 安装的管理员发现新版后自动下载并校验 SHA-256，显示「下载完成，校验通过」。
- 点击「更新到版本号」并确认后，备份数据库、切换程序并自动重启；取消不会替换当前程序。
- 下载失败显示错误并提供「重新下载」；已校验的包直接用于安装，不重复下载。
- 刷新页面保留本次检查及下载状态。重启服务或检查超过 10 分钟后，需重新检查。
- 保留只读权限、手动安装限制、固定 GitHub 仓库、版本核对与更新包路径校验。

## 安装

下载 `DomainDeck-node-linux.tar.gz` 和 `SHA256SUMS.txt`，校验后解压并运行：

```sh
sha256sum --check --ignore-missing SHA256SUMS.txt
sudo bash deploy/install.sh --public-origin https://你的实际域名
```

beta.6–beta.8 的 systemd 安装可使用已有后台检查和更新按钮升级到本版。beta.1–beta.5 首次升级需用完整包重新运行安装器。升级前备份 `/var/lib/domaindeck-node`；安装器保留账户、数据库、密钥和站点配置。新版流程在升级后生效。

## 验证边界

GitHub Actions 执行 Vben 类型检查、前后端测试、生产构建、x64/ARM64 隔离打包和 Chromium 桌面/手机回归。更新浏览器测试使用虚构 GitHub 响应，验证检查、自动下载、取消、确认、备份及重启回调，不会操作实际部署。

本版保留 Cloudflare DNS/Registrar 注册及转入、Spaceship 和 Porkbun 接入。真实注册商扣费、通知投递和实机 systemd 自启需部署者验证；测试版不等同于外部独立安全审计。
