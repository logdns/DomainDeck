import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { HttpError, requireValue } from './errors.js';

export function publicAddress(address) {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split('.').map(Number);
  return !(first === 0 || first === 10 || first === 127 || first >= 224 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && [0, 168].includes(second)) || (first === 100 && second >= 64 && second <= 127) || (first === 198 && [18, 19, 51].includes(second)) || (first === 203 && second === 0));
}

export function publicURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Invalid URL'); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443'), 'Only public HTTPS endpoints on port 443 are supported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  requireValue(host.includes('.') && host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && (!isIP(host) || publicAddress(host)), 'Private network endpoints are not supported');
  return url;
}

export async function publicRequest(target, options = {}) {
  const url = publicURL(target);
  const addresses = await lookup(url.hostname, { all: true });
  requireValue(addresses.length && addresses.every((entry) => publicAddress(entry.address)), 'Endpoint resolves to a private network');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const pending = request(url, {
      method: options.method || 'GET', headers: options.headers,
      lookup: (_hostname, settings, callback) => settings.all ? callback(null, [address]) : callback(null, address.address, address.family),
      servername: url.hostname, rejectUnauthorized: true,
      signal: AbortSignal.timeout(20000),
    }, async (response) => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) { response.destroy(); throw new Error('Response too large'); }
          chunks.push(chunk);
        }
        requireValue(response.statusCode < 300 || response.statusCode >= 400, 'Endpoint redirect rejected', 502);
        resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers }));
      } catch (error) { reject(error); }
    });
    pending.on('error', () => reject(new HttpError(502, 'Remote connection failed')));
    if (options.body) pending.write(options.body);
    pending.end();
  });
}
