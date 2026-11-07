import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };

export function publicAssets(root = new URL('../public/', import.meta.url)) {
  const assets = new Map();
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory() && !entry.name.startsWith('.')) visit(file, `${relative}/`);
      else if (entry.isFile() && types[extname(entry.name)]) assets.set(`/${relative}`, { file, type: types[extname(entry.name)] });
    }
  };
  visit(root);
  if (assets.has('/index.html')) assets.set('/', assets.get('/index.html'));
  return assets;
}

export function sendAsset(response, asset) {
  response.writeHead(200, { 'Content-Type': asset.type });
  response.end(readFileSync(asset.file));
}
