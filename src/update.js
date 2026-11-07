import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { backup } from 'node:sqlite';
import { HttpError } from './errors.js';

const versionPattern = /^3\.\d+\.\d+(?:-beta\.\d+)?$/;

export function compareVersions(first, second) {
  if (!versionPattern.test(first) || !versionPattern.test(second)) throw new Error('Unsupported release version');
  const parts = (value) => { const [base, beta] = value.split('-beta.'); return [...base.split('.').map(Number), beta ? Number(beta) : Number.MAX_SAFE_INTEGER]; };
  const left = parts(first);
  const right = parts(second);
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}

export function validateBundle(bundle) {
  if (!bundle || !versionPattern.test(bundle.version) || !Array.isArray(bundle.files) || bundle.files.length > 2000) throw new Error('Invalid update bundle');
  const names = new Set();
  let size = 0;
  for (const file of bundle.files) {
    if (!file || typeof file.path !== 'string' || !/^(?:src\/[a-z-]+\.js|public\/(?:[a-zA-Z0-9_.-]+\.(?:html|js|css|svg|png|ico|json)|(?:assets|js|jse|css)\/[a-zA-Z0-9_.-]+\.(?:js|css|svg|png|woff2?))|package\.json)$/.test(file.path) || names.has(file.path) || typeof file.content !== 'string' || file.encoding !== undefined && file.encoding !== 'base64') throw new Error('Invalid bundle path');
    if (file.encoding === 'base64' && Buffer.from(file.content, 'base64').toString('base64') !== file.content) throw new Error('Invalid binary asset');
    names.add(file.path);
    size += Buffer.byteLength(file.content);
    if (size > 24 * 1024 * 1024) throw new Error('Bundle too large');
  }
  for (const name of ['package.json', 'src/cli.js', 'public/index.html']) if (!names.has(name)) throw new Error('Incomplete bundle');
  const manifest = JSON.parse(bundle.files.find((file) => file.path === 'package.json').content);
  if (manifest.version !== bundle.version || manifest.name !== 'domaindeck-node') throw new Error('Bundle version mismatch');
  const html = bundle.files.find((file) => file.path === 'public/index.html');
  if (html.encoding) throw new Error('Invalid HTML encoding');
  for (const reference of html.content.matchAll(/(?:src|href)=["']\/((?:assets|js|jse|css)\/[^"']+|_app-config[^"']+)["']/g)) if (!names.has(`public/${reference[1]}`)) throw new Error('Missing frontend asset');
  return bundle;
}

async function download(url, transport, limit) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port) throw new Error('Untrusted update URL');
  const response = await transport(parsed.href, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DomainDeck' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (limit.redirects <= 0) throw new Error('Too many redirects');
    await response.body?.cancel();
    return download(new URL(response.headers.get('location'), parsed).href, transport, { ...limit, redirects: limit.redirects - 1 });
  }
  if (!response.ok) throw new Error('GitHub download failed');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit.bytes) throw new Error('Download too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createUpdater({ version, installDirectory, dataDirectory, database, transport = fetch, restart = () => {} }) {
  let available = null;
  let busy = false;
  let latest = null;
  let checkedAt = null;
  let prepared = null;
  let downloadState = 'idle';
  let downloadError = '';
  const state = () => ({ current: version, installSupported: Boolean(installDirectory), channel: version.includes('-beta.') ? 'beta' : 'stable', latest, checkedAt, available: Boolean(available), downloadState, downloadError, busy });
  const requireAvailable = (expectedVersion) => {
    if (!available || Date.now() - available.checkedAt > 600000) throw new HttpError(409, 'Check for updates again');
    if (expectedVersion && expectedVersion !== available.version) throw new HttpError(409, 'Selected update changed; check for updates again');
  };
  const prepare = async () => {
    if (prepared) return;
    downloadState = 'downloading';
    downloadError = '';
    try {
      const bytes = await download(available.url, transport, { bytes: 32 * 1024 * 1024, redirects: 4 });
      if (createHash('sha256').update(bytes).digest('hex') !== available.digest) throw new Error('Update checksum mismatch');
      const bundle = validateBundle(JSON.parse(bytes));
      if (bundle.version !== available.version) throw new Error('Release version mismatch');
      prepared = bundle;
      downloadState = 'ready';
    } catch {
      prepared = null;
      downloadState = 'error';
      downloadError = 'GitHub 下载或 SHA-256 校验失败，请重新下载；当前程序未替换。';
      throw new HttpError(502, 'GitHub download or update checksum mismatch; retry download. Current installation unchanged.');
    }
  };
  return {
    status() { return state(); },
    async check() {
      if (busy) throw new HttpError(409, 'An update download or installation is in progress');
      available = null;
      prepared = null;
      latest = null;
      checkedAt = null;
      downloadState = 'idle';
      downloadError = '';
      const releases = JSON.parse((await download('https://api.github.com/repos/logdns/DomainDeck/releases?per_page=30', transport, { bytes: 1024 * 1024, redirects: 2 })).toString());
      const release = releases.filter((item) => !item.draft && /^v3\.\d+\.\d+(?:-beta\.\d+)?$/.test(item.tag_name) && (version.includes('-beta.') || !item.prerelease)).sort((first, second) => compareVersions(second.tag_name.slice(1), first.tag_name.slice(1)))[0];
      checkedAt = new Date().toISOString();
      if (!release) return { ...state(), version };
      const asset = release.assets?.find((item) => item.name === 'DomainDeck-node.bundle.json');
      latest = { version: release.tag_name.slice(1), source: 'github', publishedAt: release.published_at || null, size: asset?.size || null, notes: String(release.body || '').slice(0, 12000), url: `https://github.com/logdns/DomainDeck/releases/tag/${release.tag_name}` };
      if (compareVersions(latest.version, version) <= 0) return { ...state(), version: latest.version };
      if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new HttpError(502, 'Release lacks a GitHub SHA-256 digest');
      available = { version: release.tag_name.slice(1), url: asset.browser_download_url, digest: asset.digest.slice(7), checkedAt: Date.now() };
      return { ...state(), version: available.version };
    },
    async download(expectedVersion) {
      if (!installDirectory) throw new HttpError(409, 'Install with the Linux systemd installer to enable updates');
      requireAvailable(expectedVersion);
      if (busy) throw new HttpError(409, 'An update download or installation is in progress');
      busy = true;
      try { await prepare(); return { ...state(), busy: false, version: available.version }; }
      finally { busy = false; }
    },
    async apply(expectedVersion) {
      if (!installDirectory) throw new HttpError(409, 'Install with the Linux systemd installer to enable updates');
      requireAvailable(expectedVersion);
      if (busy) throw new HttpError(409, 'An update download or installation is in progress');
      busy = true;
      try {
        await prepare();
        const bundle = prepared;
        const releases = join(installDirectory, 'releases');
        mkdirSync(releases, { recursive: true, mode: 0o700 });
        const directory = join(releases, `${bundle.version}-${randomUUID()}`);
        mkdirSync(directory, { mode: 0o700 });
        for (const file of bundle.files) {
          mkdirSync(dirname(join(directory, file.path)), { recursive: true, mode: 0o700 });
          writeFileSync(join(directory, file.path), file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content, { flag: 'wx', mode: 0o600 });
        }
        await backup(database, join(dataDirectory, `before-update-${Date.now()}.sqlite`));
        const current = join(installDirectory, 'current');
        if (!existsSync(current)) throw new HttpError(409, 'Installation link is missing');
        const temporary = join(installDirectory, `.current-${randomUUID()}`);
        symlinkSync(directory, temporary, 'dir');
        renameSync(temporary, current);
        available = null;
        prepared = null;
        downloadState = 'idle';
        setTimeout(restart, 1000).unref();
        return { ok: true, version: bundle.version, restarting: true };
      } finally { busy = false; }
    },
  };
}
