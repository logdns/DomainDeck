import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { HttpError } from './resources.js';

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
  if (!bundle || !versionPattern.test(bundle.version) || !Array.isArray(bundle.files) || bundle.files.length > 100) throw new Error('Invalid update bundle');
  const names = new Set();
  let size = 0;
  for (const file of bundle.files) {
    if (!file || typeof file.path !== 'string' || !/^(?:src\/[a-z-]+\.js|public\/(?:index\.html|app\.js|style\.css)|package\.json)$/.test(file.path) || names.has(file.path) || typeof file.content !== 'string') throw new Error('Invalid bundle path');
    names.add(file.path);
    size += Buffer.byteLength(file.content);
    if (size > 2 * 1024 * 1024) throw new Error('Bundle too large');
  }
  for (const name of ['package.json', 'src/cli.js', 'public/index.html', 'public/app.js', 'public/style.css']) if (!names.has(name)) throw new Error('Incomplete bundle');
  const manifest = JSON.parse(bundle.files.find((file) => file.path === 'package.json').content);
  if (manifest.version !== bundle.version || manifest.name !== 'domaindeck-node') throw new Error('Bundle version mismatch');
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
  return {
    async check() {
      available = null;
      const releases = JSON.parse((await download('https://api.github.com/repos/logdns/DomainDeck/releases?per_page=30', transport, { bytes: 1024 * 1024, redirects: 2 })).toString());
      const release = releases.filter((item) => !item.draft && /^v3\.\d+\.\d+(?:-beta\.\d+)?$/.test(item.tag_name) && (version.includes('-beta.') || !item.prerelease)).sort((first, second) => compareVersions(second.tag_name.slice(1), first.tag_name.slice(1)))[0];
      if (!release || compareVersions(release.tag_name.slice(1), version) <= 0) return { available: false, current: version };
      const asset = release.assets.find((item) => item.name === 'DomainDeck-node.bundle.json');
      if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new HttpError(502, 'Release lacks a GitHub SHA-256 digest');
      available = { version: release.tag_name.slice(1), url: asset.browser_download_url, digest: asset.digest.slice(7), checkedAt: Date.now() };
      return { available: true, current: version, version: available.version, installSupported: Boolean(installDirectory) };
    },
    async apply() {
      if (!installDirectory) throw new HttpError(409, 'Install with the Linux systemd installer to enable updates');
      if (!available || Date.now() - available.checkedAt > 600000 || busy) throw new HttpError(409, 'Check for updates again');
      busy = true;
      try {
        const bytes = await download(available.url, transport, { bytes: 3 * 1024 * 1024, redirects: 4 });
        if (createHash('sha256').update(bytes).digest('hex') !== available.digest) throw new HttpError(502, 'Update checksum mismatch');
        const bundle = validateBundle(JSON.parse(bytes));
        if (bundle.version !== available.version) throw new HttpError(502, 'Release version mismatch');
        const releases = join(installDirectory, 'releases');
        mkdirSync(releases, { recursive: true, mode: 0o700 });
        const directory = join(releases, `${bundle.version}-${randomUUID()}`);
        mkdirSync(directory, { mode: 0o700 });
        for (const file of bundle.files) {
          mkdirSync(join(directory, file.path.split('/')[0] === 'package.json' ? '.' : file.path.split('/')[0]), { recursive: true, mode: 0o700 });
          writeFileSync(join(directory, file.path), file.content, { flag: 'wx', mode: 0o600 });
        }
        await backup(database, join(dataDirectory, `before-update-${Date.now()}.sqlite`));
        const current = join(installDirectory, 'current');
        if (!existsSync(current)) throw new HttpError(409, 'Installation link is missing');
        const temporary = join(installDirectory, `.current-${randomUUID()}`);
        symlinkSync(directory, temporary, 'dir');
        renameSync(temporary, current);
        available = null;
        setTimeout(restart, 1000).unref();
        return { ok: true, version: bundle.version, restarting: true };
      } finally { busy = false; }
    },
  };
}
