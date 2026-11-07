#!/usr/bin/env bash
set -euo pipefail
APP_ROOT=/opt/domaindeck-node
DATA_ROOT=/var/lib/domaindeck-node
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/runtime.sh
source "$SOURCE_ROOT/deploy/runtime.sh"
NODE_OVERRIDE=''
DOWNLOAD=true
CHECK_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) [[ $# -ge 2 ]] || { echo '--node requires an absolute executable path.' >&2; exit 1; }; NODE_OVERRIDE="$2"; shift 2 ;;
    --no-download) DOWNLOAD=false; shift ;;
    --check) CHECK_ONLY=true; shift ;;
    --help|-h) echo 'Usage: bash deploy/install.sh [--node /absolute/path/to/node] [--no-download] [--check]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
[[ -z "$NODE_OVERRIDE" || "$NODE_OVERRIDE" == /* ]] || { echo '--node requires an absolute path.' >&2; exit 1; }
[[ "$(uname -s)" == Linux ]] || { echo 'This installer requires Linux and systemd.' >&2; exit 1; }
NODE_BIN="$(find_node "$APP_ROOT/runtime" "$NODE_OVERRIDE")" || {
  [[ -z "$NODE_OVERRIDE" ]] || exit 1
  CURRENT_NODE="$(node --version 2>/dev/null || true)"
  echo "No usable Node.js 24 + SQLite found (PATH version: ${CURRENT_NODE:-not installed})." >&2
  if [[ "$CHECK_ONLY" == true || "$DOWNLOAD" == false ]]; then
    echo 'Run the installer without --no-download to prepare a private runtime, or use --node /path/to/node24.' >&2
    exit 1
  fi
  NODE_BIN=''
}
if [[ "$CHECK_ONLY" == true ]]; then
  echo "Runtime check passed: $NODE_BIN ($("$NODE_BIN" --version)); SQLite available. No files changed."
  exit 0
fi
[[ "$(id -u)" == 0 ]] || { echo 'Run the installer as root (sudo bash deploy/install.sh).' >&2; exit 1; }
if ! command -v systemctl >/dev/null 2>&1 || [[ ! -d /run/systemd/system ]]; then
  echo 'A running systemd system is required. In a container, use node src/cli.js with a persistent data volume instead.' >&2
  exit 1
fi
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
if [[ -z "$NODE_BIN" ]]; then NODE_BIN="$(download_node "$SCRATCH")"; fi
VERSION="$("$NODE_BIN" -p "JSON.parse(require('fs').readFileSync(process.argv[1])).version" "$SOURCE_ROOT/package.json")"
[[ "$VERSION" =~ ^3\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]] || exit 1
for SOURCE_FILE in src/cli.js public/index.html public/app.js public/style.css; do
  [[ -f "$SOURCE_ROOT/$SOURCE_FILE" ]] || { echo "Incomplete package: $SOURCE_FILE missing." >&2; exit 1; }
done
if ! id domaindeck-node >/dev/null 2>&1; then useradd --system --home-dir "$DATA_ROOT" --shell /usr/sbin/nologin domaindeck-node; fi
install -d -m 700 -o domaindeck-node -g domaindeck-node "$APP_ROOT" "$APP_ROOT/releases" "$DATA_ROOT"
install -d -m 755 -o root -g root "$APP_ROOT/runtime"
if [[ "$NODE_BIN" != "$APP_ROOT/runtime/node" ]]; then
  install -m 755 -o root -g root "$NODE_BIN" "$APP_ROOT/runtime/.node-install"
  mv -f "$APP_ROOT/runtime/.node-install" "$APP_ROOT/runtime/node"
fi
NODE_BIN="$APP_ROOT/runtime/node"
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
ExecStart=$NODE_BIN $APP_ROOT/current/src/cli.js --auto-port=false
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
if ! "$NODE_BIN" --input-type=module -e '
  import { get } from "node:http";
  const expected = process.argv[1];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const healthy = await new Promise((resolve) => {
      const request = get("http://127.0.0.1:4781/api/health", (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; if (body.length > 4096) request.destroy(); });
        response.on("end", () => { try { const data = JSON.parse(body); resolve(response.statusCode === 200 && data.data?.version === expected); } catch { resolve(false); } });
        response.on("error", () => resolve(false));
      });
      request.setTimeout(1000, () => request.destroy());
      request.on("error", () => resolve(false));
    });
    if (healthy) process.exit(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.exit(1);
' "$VERSION" || ! systemctl is-active --quiet domaindeck-node; then
  echo 'Service failed its startup check. Inspect: journalctl -u domaindeck-node -n 80 --no-pager' >&2
  exit 1
fi
echo "Installed DomainDeck $VERSION with $("$NODE_BIN" --version). Service health check passed."
echo "Open http://127.0.0.1:4781 via your HTTPS reverse proxy."
echo "Initial username: admin. Password file: $DATA_ROOT/initial-admin-password"
echo 'Check: systemctl status domaindeck-node; journalctl -u domaindeck-node'
