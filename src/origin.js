export function publicOrigin(value) {
  if (value === undefined || value === '') return undefined;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid public origin: use http(s)://hostname[:port]'); }
  if (typeof value !== 'string' || !/^https?:\/\/[^/?#]+\/?$/i.test(value) || /[\s\\%?#]/.test(value) || !['http:', 'https:'].includes(parsed.protocol) || !/^(?:[a-z\d._-]+|\[[a-f\d:.]+\])$/i.test(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new Error('Invalid public origin: use http(s)://hostname[:port] without credentials, path, query or fragment');
  }
  return parsed.origin;
}

export function allowsOrigin(value, host, configured) {
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) return false;
  return configured ? value === configured : parsed.host === host;
}
