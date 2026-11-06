#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$(id -u)" != 0 ]]; then
  echo 'Run as root on Linux with systemd and Node.js 24 installed.' >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
[[ "$($NODE_BIN -p 'process.versions.node.split(".")[0]')" == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 1; }
APP_ROOT=/opt/domaindeck-node
DATA_ROOT=/var/lib/domaindeck-node
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$($NODE_BIN -p "JSON.parse(require('fs').readFileSync(process.argv[1])).version" "$SOURCE_ROOT/package.json")"
[[ "$VERSION" =~ ^3\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]] || exit 1
if ! id domaindeck-node >/dev/null 2>&1; then useradd --system --home-dir "$DATA_ROOT" --shell /usr/sbin/nologin domaindeck-node; fi
install -d -m 700 -o domaindeck-node -g domaindeck-node "$APP_ROOT" "$APP_ROOT/releases" "$DATA_ROOT"
DESTINATION="$APP_ROOT/releases/$VERSION-$(date +%s)"
install -d -m 700 "$DESTINATION"
cp -R "$SOURCE_ROOT/src" "$SOURCE_ROOT/public" "$SOURCE_ROOT/package.json" "$DESTINATION/"
chown -R domaindeck-node:domaindeck-node "$DESTINATION"
ln -s "$DESTINATION" "$APP_ROOT/.current-install"
mv -Tf "$APP_ROOT/.current-install" "$APP_ROOT/current"
cat > /etc/systemd/system/domaindeck-node.service <<EOF
[Unit]
Description=DomainDeck Node.js domain management
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=domaindeck-node
Group=domaindeck-node
WorkingDirectory=$APP_ROOT
Environment=NODE_ENV=production
Environment=DOMAINDECK_DATA=$DATA_ROOT
Environment=DOMAINDECK_INSTALL=$APP_ROOT
Environment=HOST=127.0.0.1
Environment=PORT=4781
ExecStart=$NODE_BIN $APP_ROOT/current/src/cli.js
Restart=always
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_ROOT $DATA_ROOT
RestrictSUIDSGID=true
LimitNOFILE=4096
MemoryMax=512M
TasksMax=64

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable domaindeck-node
systemctl restart domaindeck-node
echo "Open http://127.0.0.1:4781 via your HTTPS reverse proxy."
echo "Initial username: admin. Password file: $DATA_ROOT/initial-admin-password"
echo 'Check: systemctl status domaindeck-node; journalctl -u domaindeck-node'
