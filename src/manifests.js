import { HttpError, requireValue } from './errors.js';
import { publicRequest, publicURL } from './network.js';
import { domainName } from './providers.js';

export function valueAt(value, path) {
  if (!path) return value;
  return String(path).split('.').reduce((current, field) => current && Object.hasOwn(current, field) ? current[field] : field === '#text' && current ? current.$text : undefined, value);
}

function entity(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (match) => {
    const literals = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (literals[match]) return literals[match];
    const code = match[2].toLowerCase() === 'x' ? parseInt(match.slice(3, -1), 16) : Number(match.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export function parseXML(source) {
  requireValue(source.length < 4 * 1024 * 1024 && !/<!DOCTYPE|<!ENTITY/i.test(source), 'Unsafe XML response', 502);
  const root = Object.create(null);
  const stack = [{ name: '', value: root }];
  for (const token of source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      requireValue(stack.length > 1 && token.slice(2, -1).trim() === stack.at(-1).name, 'Invalid XML response', 502);
      stack.pop();
    } else if (token.startsWith('<')) {
      const match = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)\/?>$/.exec(token);
      requireValue(match && stack.length < 100, 'Invalid XML response', 502);
      const value = Object.create(null);
      for (const attribute of match[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) value[attribute[1]] = entity(attribute[2] ?? attribute[3]);
      const parent = stack.at(-1).value;
      if (Object.hasOwn(parent, match[1])) parent[match[1]] = Array.isArray(parent[match[1]]) ? [...parent[match[1]], value] : [parent[match[1]], value];
      else parent[match[1]] = value;
      if (!token.endsWith('/>')) stack.push({ name: match[1], value });
    } else if (token.trim()) stack.at(-1).value.$text = entity(token.trim());
  }
  requireValue(stack.length === 1, 'Unclosed XML response', 502);
  return root;
}

export function validateManifest(input) {
  requireValue(input && typeof input === 'object' && /^[a-z][a-z0-9_-]{1,31}$/.test(input.id || '') && typeof input.name === 'string' && input.name.length <= 100, 'Invalid manifest identity');
  requireValue(!['spaceship', 'cloudflare', 'porkbun'].includes(input.id), 'Built-in provider IDs cannot be replaced');
  publicURL(input.request?.baseUrl);
  requireValue(['json', 'xml'].includes(input.request.format || 'json'), 'Unsupported response format');
  requireValue(['none', 'header', 'query', 'body', 'basic'].includes(input.request.auth?.type || 'none'), 'Unsupported authentication');
  requireValue(Array.isArray(input.fields) && input.fields.length > 0 && input.fields.length <= 30 && input.fields.every((field) => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(field.key) && typeof field.label === 'string'), 'Invalid credential fields');
  requireValue(input.ops && Object.keys(input.ops).length > 0 && Object.keys(input.ops).length <= 40, 'Invalid operations');
  for (const operation of Object.values(input.ops)) {
    requireValue(typeof operation.path === 'string' && operation.path.startsWith('/') && !operation.path.startsWith('//') && !operation.path.includes('..') && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(operation.method || 'GET'), 'Invalid operation path or method');
    if (operation.pagination) requireValue(Number.isInteger(operation.pagination.pageSize) && operation.pagination.pageSize >= 1 && operation.pagination.pageSize <= 1000, 'Invalid pagination size');
  }
  requireValue(JSON.stringify(input).length <= 128000, 'Manifest too large');
  return structuredClone(input);
}

function template(value, variables, encode = false) {
  if (Array.isArray(value)) return value.map((entry) => template(entry, variables, encode));
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, '$literal')) return value.$literal;
    if (Object.hasOwn(value, '$when')) return template(value[String(Boolean(valueAt(variables, value.$when)))], variables, encode);
    if (value.$input === true) return { ...(variables.input || {}), ...Object.fromEntries(Object.entries(value).filter(([field]) => field !== '$input').map(([field, entry]) => [field, template(entry, variables, encode)])) };
    if (Object.hasOwn(value, '$fmt')) {
      const source = template(value.value, variables, false);
      if (value.$fmt === 'int') return Number.parseInt(source, 10) || 0;
      if (value.$fmt === 'float') return Number(source) || 0;
      if (value.$fmt === 'bool') return ['true', '1', 'yes', 'on'].includes(String(source).toLowerCase()) || source === true;
      if (value.$fmt === 'cents') return Number(source) / 100;
      if (value.$fmt === 'lower') return String(source ?? '').toLowerCase();
      if (value.$fmt === 'string') return String(source ?? '');
      if (value.$fmt === 'unix') { const date = new Date(Number(source) * 1000); return Number.isFinite(date.getTime()) ? date.toISOString() : ''; }
      if (value.$fmt === 'date') return source ? `${String(source).slice(0, 10)}T00:00:00.000Z` : '';
      if (value.$fmt === 'iso') { const date = Date.parse(String(source || '')); return Number.isFinite(date) ? new Date(date).toISOString() : source; }
      return source;
    }
    return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, template(entry, variables, encode)]));
  }
  if (typeof value !== 'string') return value;
  const exact = /^\{([^}]+)\}$/.exec(value);
  if (exact && !encode) return valueAt(variables, exact[1]) ?? '';
  return value.replace(/\{([^}]+)\}/g, (_match, field) => encode ? encodeURIComponent(String(valueAt(variables, field) ?? '')) : String(valueAt(variables, field) ?? ''));
}

function mapped(row, mapping) {
  if (!mapping) return row;
  return Object.fromEntries(Object.entries(mapping).map(([field, specification]) => {
    if (specification && typeof specification === 'object' && Object.hasOwn(specification, '$literal')) return [field, specification.$literal];
    if (specification === null || !['string', 'object'].includes(typeof specification)) return [field, specification];
    let value = valueAt(row, typeof specification === 'string' ? specification : specification.path);
    if (value && typeof value === 'object' && Object.hasOwn(value, '$text')) value = value.$text;
    if (value && typeof value === 'object' && Object.hasOwn(value, '#text')) value = value['#text'];
    const format = specification?.format;
    if (format === 'bool') value = ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase()) || typeof value === 'number' && value !== 0;
    else if (format === 'int') value = parseInt(value, 10) || 0;
    else if (format === 'cents') value = Number(value) / 100;
    else if (format === 'lower') value = String(value || '').toLowerCase();
    else if (format === 'string') value = String(value ?? '');
    else if (format === 'unix') { const date = new Date(Number(value) * 1000); value = Number.isFinite(date.getTime()) ? date.toISOString() : ''; }
    else if (format === 'date') value = String(value || '').slice(0, 10) ? `${String(value).slice(0, 10)}T00:00:00.000Z` : '';
    else if (format === 'iso') { const parsed = Date.parse(String(value || '')); value = Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value || ''); }
    return [field, value ?? null];
  }));
}

export class ManifestProvider {
  constructor(manifest, credentials, transport = publicRequest) {
    this.manifest = validateManifest(manifest);
    this.provider = manifest.id;
    this.credentials = credentials;
    this.transport = transport;
    for (const field of manifest.fields) requireValue(!field.required || typeof credentials[field.key] === 'string' && credentials[field.key], `Missing credential: ${field.key}`);
  }

  async execute(name, variables = {}, depth = 0) {
    if (name === 'test' && !this.manifest.ops.test) return { result: await this.domains() };
    const capability = { setAutoRenew: 'autoRenew', setNameservers: 'nameservers', getAuthCode: 'authCode', setTransferLock: 'transferLock', listDns: 'dnsRead', createDns: 'dnsWrite', updateDns: 'dnsWrite', deleteDns: 'dnsWrite' }[name] || name;
    requireValue(this.manifest.capabilities?.[capability] !== false, 'Operation disabled by provider manifest', 409);
    requireValue(!['listDns', 'createDns', 'updateDns', 'deleteDns'].includes(name) || this.manifest.capabilities?.dns !== false, 'DNS disabled by provider manifest', 409);
    const operation = this.manifest.ops[name];
    if (!operation) throw new HttpError(409, 'This provider does not expose that operation');
    requireValue(depth < 3, 'Recursive cost operations are not supported');
    const values = { ...(variables.input || {}), ...variables, ...this.credentials };
    if (operation.cost) {
      const price = await this.execute(operation.cost.op || 'availability', variables, depth + 1);
      const source = valueAt(price.result, operation.cost.path) ?? valueAt(price.raw, operation.cost.path);
      const amount = Number(source);
      requireValue(source !== null && source !== undefined && source !== '' && Number.isFinite(amount) && amount >= 0, 'Provider did not return a usable price', 502);
      requireValue(variables.expectedAmount === undefined || Number(variables.expectedAmount) === amount * (operation.cost.byYears ? variables.years || 1 : 1), 'Price changed; query a new quote', 409);
      values.cost = Math.round(amount * (operation.cost.multiply || 1) * (operation.cost.byYears ? variables.years || 1 : 1));
    }
    const base = new URL(this.manifest.request.baseUrl);
    const path = template(operation.path, values, true);
    const target = new URL(base.href.replace(/\/$/, '') + (path === '/' ? '' : path));
    requireValue(target.origin === base.origin, 'Operation changed provider origin');
    const headers = template(this.manifest.request.headers || {}, values);
    headers.Accept = 'application/json, application/xml';
    let body = template(operation.body || {}, values);
    for (const [field, value] of Object.entries(template(operation.query || {}, values))) target.searchParams.set(field, String(value));
    const authentication = this.manifest.request.auth || { type: 'none' };
    if (operation.auth !== false) {
      const authValues = template(authentication.map || {}, values);
      if (authentication.type === 'header') Object.assign(headers, authValues);
      if (authentication.type === 'query') for (const [field, value] of Object.entries(authValues)) target.searchParams.set(field, String(value));
      if (authentication.type === 'body') body = { ...body, ...authValues };
      if (authentication.type === 'basic') {
        const user = values[authentication.user] ?? template(authentication.user, values);
        const pass = values[authentication.pass] ?? template(authentication.pass, values);
        headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
      }
    }
    const method = operation.method || 'GET';
    const response = await this.transport(target.href, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
    requireValue(response.ok, 'Custom provider request rejected', 502);
    const rawText = await response.text();
    requireValue(rawText.length <= 4 * 1024 * 1024, 'Provider response too large', 502);
    const raw = this.manifest.request.format === 'xml' ? parseXML(rawText) : rawText ? JSON.parse(rawText) : {};
    requireValue(raw.ApiResponse?.Status !== 'ERROR' && raw.status !== 'ERROR' && raw.success !== false, 'Custom provider returned an error', 502);
    let result = valueAt(raw, operation.resultPath);
    if (operation.itemsPath || Array.isArray(result)) {
      const entries = operation.itemsPath ? valueAt(raw, operation.itemsPath) : result;
      result = (Array.isArray(entries) ? entries : entries ? [entries] : []).map((row) => mapped(row, operation.map));
    } else result = mapped(result, operation.map);
    if (name === 'getDomain' && this.manifest.ops.getNs) {
      const nameservers = (await this.execute('getNs', variables, depth + 1)).result;
      result = { ...(result || {}), nameservers };
    }
    if (operation.values && result && typeof result === 'object') result.result = operation.values[result.result] || result.result;
    return { raw, result, total: valueAt(raw, operation.totalPath), operationId: response.headers.get('spaceship-async-operationid') || '' };
  }

  async domains() {
    const items = [];
    const seen = new Set();
    const size = this.manifest.ops.listDomains?.pagination?.pageSize;
    let cursor = '';
    for (let page = 1; page <= 1000; page += 1) {
      const { result, total } = await this.execute('listDomains', { page, cursor });
      requireValue(Array.isArray(result), 'listDomains must return items', 502);
      for (const item of result) {
        const name = domainName(item.name || item.domain);
        requireValue(!seen.has(name), 'Provider pagination repeated a domain; sync aborted', 502);
        seen.add(name);
        items.push({ name, remoteId: item.name || item.domain, expiresAt: item.expirationDate || item.expires || '', autoRenew: item.autoRenew === true || item.renewAuto === true });
      }
      if (!size || result.length < size || total !== undefined && items.length >= Number(total)) return items;
      requireValue(items.length < 100000, 'Provider pagination limit exceeded', 502);
      cursor = items.at(-1)?.name || '';
    }
    throw new HttpError(502, 'Provider pagination limit exceeded');
  }

  async records(domain) {
    const { result } = await this.execute('listDns', { domain: domain.name, zoneId: domain.remote_id });
    requireValue(Array.isArray(result), 'listDns must return items', 502);
    return result.map((record) => ({ ...record, id: String(record.id ?? record.recordId ?? ''), type: String(record.type || '').toUpperCase(), name: record.name || '@', content: record.content ?? record.value ?? record.data ?? '' }));
  }

  async writeRecord(domain, input, id, remove = false) {
    const record = { ...input };
    if (!remove) requireValue(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'].includes(String(record.type).toUpperCase()) && typeof record.content === 'string' && record.content.length > 0 && record.content.length <= 4096 && typeof record.name === 'string' && record.name.length <= 253 && !/[\s/]/.test(record.name), 'Invalid DNS record');
    record.type = String(record.type || '').toUpperCase();
    delete record.proxied;
    delete record.proxiable;
    if (this.manifest.dns?.nameMode === 'subdomain') record.name = record.name === domain.name || record.name === '@' ? '' : String(record.name).replace(new RegExp(`\\.${domain.name.replaceAll('.', '\\.')}$`), '');
    else if (!remove) record.name = record.name === '@' || !record.name ? domain.name : record.name === domain.name || record.name.endsWith(`.${domain.name}`) ? record.name : `${record.name}.${domain.name}`;
    record.ttl = Math.max(Number(record.ttl || 600), this.manifest.dns?.minTTL || 60);
    record[this.manifest.dns?.priorityKey || 'priority'] = Number(record.priority || 0);
    requireValue(Number.isInteger(record.ttl) && record.ttl <= 86400 && Number.isInteger(Number(record.priority || 0)) && Number(record.priority || 0) >= 0 && Number(record.priority || 0) <= 65535, 'Invalid DNS TTL or priority');
    if (this.manifest.dns?.priorityKey && this.manifest.dns.priorityKey !== 'priority') delete record.priority;
    if (this.manifest.dns?.commentKey && record.comment !== undefined) { record[this.manifest.dns.commentKey] = record.comment; if (this.manifest.dns.commentKey !== 'comment') delete record.comment; }
    return (await this.execute(remove ? 'deleteDns' : id ? 'updateDns' : 'createDns', { domain: domain.name, recordId: id || '', zoneId: domain.remote_id, input: record })).result;
  }
}
