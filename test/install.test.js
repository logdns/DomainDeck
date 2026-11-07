import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const runtime = fileURLToPath(new URL('../deploy/runtime.sh', import.meta.url));
const installer = fileURLToPath(new URL('../deploy/install.sh', import.meta.url));
const environment = (directory) => ({ PATH: `${directory}/tools:/usr/local/bin:/usr/bin:/bin`, HOME: directory, TMPDIR: directory });
const executable = (path, content) => writeFileSync(path, `#!/bin/bash\nset -e\n${content}\n`, { mode: 0o755 });

test('installer check accepts Node 24 with SQLite, handles spaces and rejects explicitly selected older runtimes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-runtime-'));
  try {
    const selected = join(directory, 'node 24');
    executable(selected, `exec "${process.execPath}" "$@"`);
    const checked = spawnSync('bash', [installer, '--check', '--node', selected], { env: environment(directory), encoding: 'utf8', timeout: 5000 });
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /SQLite available/);
    const old = join(directory, 'old-node');
    executable(old, 'echo v20.0.0; exit 1');
    const rejected = spawnSync('bash', [installer, '--check', '--node', old], { env: environment(directory), encoding: 'utf8', timeout: 5000 });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Specified Node cannot run Node.js 24/);
    assert.equal(existsSync(join(directory, 'data')), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runtime archive is verified before extraction and the extracted Node must provide SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-runtime-archive-'));
  try {
    const member = 'node-fixture-linux-arm64';
    mkdirSync(join(directory, member, 'bin'), { recursive: true });
    executable(join(directory, member, 'bin', 'node'), `exec "${process.execPath}" "$@"`);
    const archive = join(directory, 'node.tar.gz');
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', directory, member], { env: environment(directory) }).status, 0);
    const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
    const run = (hash, destination) => spawnSync('bash', ['-ec', 'source "$1"; unpack_node "$2" "$3" "$4" "$5"', 'check', runtime, archive, hash, member, destination], { env: environment(directory), encoding: 'utf8', timeout: 5000 });
    const good = run(digest, join(directory, 'good'));
    assert.equal(good.status, 0, good.stderr);
    const bad = run('0'.repeat(64), join(directory, 'bad'));
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /SHA-256 mismatch/);
    assert.equal(existsSync(join(directory, 'bad')), false);
    executable(join(directory, member, 'bin', 'node'), 'exit 1');
    spawnSync('tar', ['-czf', archive, '-C', directory, member], { env: environment(directory) });
    const unusable = run(createHash('sha256').update(readFileSync(archive)).digest('hex'), join(directory, 'unusable'));
    assert.notEqual(unusable.status, 0);
    assert.match(unusable.stderr, /cannot run on this system/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runtime downloader uses pinned HTTPS release and never extracts a mismatched archive', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-runtime-download-'));
  mkdirSync(join(directory, 'tools'));
  try {
    executable(join(directory, 'tools', 'curl'), `printf '%s\\n' "$@" > "${directory}/curl-args"; while [[ $# -gt 0 ]]; do if [[ "$1" == --output ]]; then printf invalid > "$2"; break; fi; shift; done`);
    const result = spawnSync('bash', ['-ec', 'source "$1"; download_node "$2"', 'check', runtime, directory], { env: environment(directory), encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SHA-256 mismatch/);
    assert.match(readFileSync(join(directory, 'curl-args'), 'utf8'), /https:\/\/nodejs.org\/dist\/v24\.22\.2\/node-v24\.22\.2-linux-(arm64|x64)\.tar\.gz/);
    assert.equal(existsSync(join(directory, 'node')), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('staged installer copies a private runtime, preserves data, configures the unit and checks a running app', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domaindeck-install-'));
  const tools = join(directory, 'tools');
  const app = join(directory, 'app');
  const data = join(directory, 'data');
  const system = join(directory, 'system');
  const pidFile = join(directory, 'pid');
  mkdirSync(tools);
  mkdirSync(system);
  mkdirSync(data);
  writeFileSync(join(data, 'preserve.txt'), 'existing-data');
  const selected = join(directory, 'selected-node');
  executable(selected, `exec "${process.execPath}" "$@"`);
  executable(join(tools, 'id'), 'if [[ "$1" == -u ]]; then echo 0; else exit 1; fi');
  executable(join(tools, 'useradd'), 'exit 0');
  executable(join(tools, 'chown'), 'exit 0');
  executable(join(tools, 'install'), 'args=(); while [[ $# -gt 0 ]]; do case "$1" in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done; exec /usr/bin/install "${args[@]}"');
  executable(join(tools, 'systemctl'), `
    case "$1" in
      restart)
        envs=(); command=()
        while IFS= read -r line; do
          case "$line" in Environment=*) envs+=("\${line#Environment=}") ;; ExecStart=*) read -r -a command <<< "\${line#ExecStart=}" ;; esac
        done < "${system}/domaindeck-node.service"
        /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin HOME="${directory}" TMPDIR="${directory}" "\${envs[@]}" "\${command[@]}" > "${directory}/app.log" 2>&1 &
        echo $! > "${pidFile}"
        ;;
      is-active) kill -0 "$(cat "${pidFile}")" ;;
    esac`);
  const source = readFileSync(installer, 'utf8')
    .replace('APP_ROOT=/opt/domaindeck-node', `APP_ROOT=${app}`)
    .replace('DATA_ROOT=/var/lib/domaindeck-node', `DATA_ROOT=${data}`)
    .replace('SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"', `SOURCE_ROOT="${fileURLToPath(new URL('..', import.meta.url))}"`)
    .replaceAll('/run/systemd/system', system)
    .replaceAll('/etc/systemd/system', system);
  const staged = join(directory, 'install.sh');
  writeFileSync(staged, source);
  try {
    const result = spawnSync('bash', [staged, '--node', selected, '--no-download'], { env: environment(directory), encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${result.stderr}\n${existsSync(join(directory, 'app.log')) ? readFileSync(join(directory, 'app.log'), 'utf8') : ''}`);
    assert.match(result.stdout, /Service health check passed/);
    assert.equal(readFileSync(join(data, 'preserve.txt'), 'utf8'), 'existing-data');
    assert.equal(readFileSync(join(app, 'runtime', 'node'), 'utf8'), readFileSync(selected, 'utf8'));
    const unit = readFileSync(join(system, 'domaindeck-node.service'), 'utf8');
    assert.ok(unit.includes(`ExecStart=${app}/runtime/node ${app}/current/src/cli.js --auto-port=false`));
    assert.match(unit, /User=domaindeck-node/);
    assert.ok(existsSync(join(data, 'domaindeck.sqlite')));
  } finally {
    if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 'SIGTERM'); } catch {} }
    rmSync(directory, { recursive: true, force: true });
  }
});
