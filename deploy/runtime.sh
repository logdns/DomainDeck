#!/usr/bin/env bash

node_usable() {
  [[ -x "$1" ]] && "$1" --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    if (process.versions.node.split(".")[0] !== "24") process.exit(1);
    const database = new DatabaseSync(":memory:");
    database.prepare("SELECT 1").get();
    database.close();
  ' >/dev/null 2>&1
}

find_node() {
  local managed="$1" explicit="$2" candidate found
  if [[ -n "$explicit" ]]; then
    if ! node_usable "$explicit"; then
      echo "Specified Node cannot run Node.js 24 with SQLite: $explicit" >&2
      return 1
    fi
    printf '%s\n' "$explicit"
    return 0
  fi
  found="$(command -v node || true)"
  for candidate in "$managed/node" "$found" /usr/local/bin/node /usr/bin/node /www/server/nodejs/v24*/bin/node; do
    if [[ -n "$candidate" ]] && node_usable "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}

runtime_release() {
  NODE_RELEASE=v24.22.2
  case "$1" in
    x86_64|amd64) NODE_ARCH=x64; NODE_SHA256=361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9 ;;
    aarch64|arm64) NODE_ARCH=arm64; NODE_SHA256=95c264150aceb7f3437a29fd6984924f5f8d1511ea3cbd6c508b83f6c555dae2 ;;
    *) echo "Automatic Node installation supports Linux x64 and ARM64; unsupported architecture: $1" >&2; return 1 ;;
  esac
}

unpack_node() {
  local archive="$1" digest="$2" member="$3" output="$4"
  if ! printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status; then
    echo 'Node archive SHA-256 mismatch; installation stopped.' >&2
    return 1
  fi
  mkdir -p "$output"
  tar --extract --gzip --file "$archive" --directory "$output" --strip-components=1 "$member/bin/node" || return 1
  if ! node_usable "$output/bin/node"; then
    echo 'Downloaded Node.js 24 cannot run on this system. Check glibc/libstdc++ compatibility or use a supported Linux distribution.' >&2
    "$output/bin/node" --version >&2 || true
    return 1
  fi
}

download_node() {
  local scratch="$1" dependency archive
  for dependency in curl tar gzip sha256sum; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
      echo "Missing $dependency. Install curl, ca-certificates, tar, gzip and coreutils using the system package manager." >&2
      return 1
    fi
  done
  runtime_release "$(uname -m)" || return 1
  archive="$scratch/node.tar.gz"
  echo "Preparing private Node.js $NODE_RELEASE ($NODE_ARCH) from nodejs.org; the system Node is unchanged." >&2
  curl --fail --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --retry 2 --connect-timeout 15 --max-time 300 --max-filesize 83886080 \
    --output "$archive" "https://nodejs.org/dist/$NODE_RELEASE/node-$NODE_RELEASE-linux-$NODE_ARCH.tar.gz" || return 1
  unpack_node "$archive" "$NODE_SHA256" "node-$NODE_RELEASE-linux-$NODE_ARCH" "$scratch/node" || return 1
  printf '%s\n' "$scratch/node/bin/node"
}
