import { createHash } from 'node:crypto';
import { HttpError, requireValue } from './errors.js';

function invalid(message) { return new HttpError(400, message); }

export function domainName(value) {
  if (typeof value !== 'string') throw invalid('Invalid domain');
  const name = value.toLowerCase().replace(/\.$/, '');
  if (name.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(name)) throw invalid('Invalid domain; use punycode for international domains');
  return name;
}

export function dnsName(value) {
  if (typeof value !== 'string') throw invalid('Invalid DNS name');
  const name = value.toLowerCase().replace(/\.$/, '');
  if (name.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(name)) throw invalid('Invalid DNS name');
  return name;
}

export function validateCredentials(provider, credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw invalid('Credentials required');
  const fields = provider === 'porkbun' ? ['apiKey', 'secretKey'] : provider === 'spaceship' ? ['apiKey', 'apiSecret'] : provider === 'cloudflare' ? ['token', 'accountId'] : [];
  if (!fields.length || fields.some((field) => typeof credentials[field] !== 'string' || !credentials[field].trim() || credentials[field].length > 1024)) throw invalid('Invalid provider credentials');
  if (provider === 'cloudflare' && !/^[a-f0-9]{32}$/i.test(credentials.accountId)) throw invalid('Invalid Cloudflare account ID');
  return Object.fromEntries(fields.map((field) => [field, credentials[field].trim()]));
}

async function jsonResponse(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('Provider response too large');
    chunks.push(chunk);
  }
  if (!size && response.status === 202) return {};
  return JSON.parse(Buffer.concat(chunks).toString());
}

export class Provider {
  constructor(provider, credentials, transport = fetch) {
    this.provider = provider;
    this.credentials = validateCredentials(provider, credentials);
    this.transport = transport;
  }

  async request(path, method = 'GET', body) {
    const porkbun = this.provider === 'porkbun';
    const spaceship = this.provider === 'spaceship';
    const origin = porkbun ? 'https://api.porkbun.com/api/json/v3' : spaceship ? 'https://spaceship.dev/api/v1' : 'https://api.cloudflare.com/client/v4';
    const headers = { 'Content-Type': 'application/json' };
    if (spaceship) {
      headers['X-API-Key'] = this.credentials.apiKey;
      headers['X-API-Secret'] = this.credentials.apiSecret;
    } else if (!porkbun) headers.Authorization = `Bearer ${this.credentials.token}`;
    if (porkbun && method === 'GET') { headers['X-API-Key'] = this.credentials.apiKey; headers['X-Secret-API-Key'] = this.credentials.secretKey; }
    const payload = porkbun ? method === 'GET' ? undefined : { ...body, apikey: this.credentials.apiKey, secretapikey: this.credentials.secretKey } : body;
    const response = await this.transport(origin + path, {
      method, headers,
      body: payload ? JSON.stringify(payload) : undefined,
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const result = response.status === 204 ? {} : await jsonResponse(response);
    if (!response.ok || (!spaceship && (porkbun ? result.status !== 'SUCCESS' : result.success !== true))) {
      throw new HttpError(502, `${this.provider} API returned HTTP ${response.status}; verify credentials, API access and required permissions`);
    }
    if (spaceship && response.status === 202) return { ...result, operationId: response.headers.get('spaceship-async-operationid'), accepted: true };
    return result;
  }

  async domains() {
    if (this.provider === 'spaceship') {
      const result = [];
      for (let skip = 0; skip < 100000; skip += 100) {
        const data = await this.request(`/domains?take=100&skip=${skip}`);
        for (const item of data.items || []) result.push({ name: domainName(item.name), remoteId: item.name, expiresAt: item.expirationDate || '', autoRenew: item.autoRenew === true, metadata: { status: item.lifecycleStatus || '', registrationDate: item.registrationDate || '', nameservers: item.nameservers || null, isPremium: item.isPremium === true, eppStatuses: item.eppStatuses || [] } });
        if (!(data.items || []).length || result.length >= data.total || data.items.length < 100) return result;
      }
      throw new Error('Provider pagination limit exceeded');
    }
    if (this.provider === 'porkbun') {
      const result = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const data = await this.request('/domain/listAll', 'POST', { start: offset, includeLabels: 'yes' });
        for (const item of data.domains || []) result.push({ name: domainName(item.domain), remoteId: item.domain, expiresAt: item.expireDate || '', autoRenew: ['1', 'true'].includes(String(item.autoRenew)), metadata: { status: item.status || '', registrationDate: item.createDate || '', nameservers: item.nameservers || null } });
        if ((data.domains || []).length < 1000) return result;
      }
      throw new Error('Provider pagination limit exceeded');
    }
    const result = [];
    for (let page = 1; page <= 1000; page += 1) {
      const data = await this.request(`/zones?account.id=${this.credentials.accountId}&per_page=50&page=${page}`);
      for (const item of data.result || []) result.push({ name: domainName(item.name), remoteId: item.id, expiresAt: '', autoRenew: false });
      if (page >= (data.result_info?.total_pages || 1)) return result;
    }
    throw new Error('Provider pagination limit exceeded');
  }

  async records(domain) {
    if (this.provider === 'spaceship') {
      const result = [];
      for (let skip = 0; skip < 100000; skip += 100) {
        const data = await this.request(`/dns/records/${encodeURIComponent(domain.name)}?take=100&skip=${skip}`);
        result.push(...(data.items || []).map((item) => ({ ...item, id: createHash('sha256').update(JSON.stringify(item)).digest('hex'), raw: item, content: item.address || item.value || item.cname || item.exchange || item.nameserver || item.target || item.aliasName || item.pointer || '', priority: item.priority ?? item.preference, name: item.type === 'SRV' ? `${item.service}.${item.protocol}${item.name && item.name !== '@' ? `.${item.name}` : ''}` : item.name || item.host || '@' })));
        if (!(data.items || []).length || result.length >= data.total || data.items.length < 100) return result;
      }
      throw new Error('Provider pagination limit exceeded');
    }
    if (this.provider === 'porkbun') {
      const data = await this.request(`/dns/retrieve/${encodeURIComponent(domain.name)}`, 'POST');
      return (data.records || []).map((record) => ({ ...record, id: String(record.id) }));
    }
    if (!/^[a-f0-9]{32}$/i.test(domain.remote_id)) throw new Error('Sync Cloudflare zones before managing DNS');
    const records = [];
    for (let page = 1; page <= 1000; page += 1) {
      const data = await this.request(`/zones/${domain.remote_id}/dns_records?per_page=100&page=${page}`);
      records.push(...data.result.map((record) => ({ ...record, ...(['SRV', 'CAA'].includes(record.type) && record.data ? { content: record.type === 'SRV' ? record.data.target : record.data.value, ...(record.type === 'SRV' ? { priority: record.data.priority, weight: record.data.weight, port: record.data.port } : { flag: record.data.flags, tag: record.data.tag }) } : {}) })));
      if (page >= (data.result_info?.total_pages || 1)) return records;
    }
    throw new Error('Provider pagination limit exceeded');
  }

  async writeRecord(domain, input, id, remove = false) {
    if (this.provider === 'spaceship') {
      const path = `/dns/records/${encodeURIComponent(domain.name)}`;
      if (remove) {
        const original = (await this.records(domain)).find((record) => record.id === id);
        requireValue(original, 'DNS record changed; refresh before deleting', 409);
        const { ttl: _ttl, group: _group, ...record } = original.raw;
        return this.request(path, 'DELETE', [record]);
      }
      requireValue(!id, 'Spaceship editing requires creating a replacement and deleting the old record', 409);
      const type = String(input.type || '').toUpperCase();
      const host = String(input.name || '@');
      const content = String(input.content || input.target || input.value || '');
      const ttl = Number(input.ttl || 600);
      requireValue(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA', 'ALIAS', 'PTR'].includes(type) && content.length > 0 && content.length <= 4096 && host.length <= 253 && !/[\s/]/.test(host) && Number.isInteger(ttl) && ttl >= 60 && ttl <= 86400, 'Invalid DNS record');
      const valueField = { A: 'address', AAAA: 'address', CNAME: 'cname', TXT: 'value', MX: 'exchange', NS: 'nameserver', SRV: 'target', CAA: 'value', ALIAS: 'aliasName', PTR: 'pointer' }[type];
      const item = { type, name: host, ttl, [valueField]: content };
      if (type === 'MX') item.preference = Number(input.priority ?? input.preference ?? 0);
      if (type === 'SRV') {
        const labels = /^(_[a-z\d-]+)\.(_[a-z\d-]+)(?:\.(.+))?$/i.exec(host);
        requireValue(labels, 'SRV name must start with _service._protocol');
        item.service = labels[1]; item.protocol = labels[2]; item.name = labels[3] || '@';
        item.priority = Number(input.priority || 0); item.weight = Number(input.weight || 0); item.port = Number(input.port || 0);
        requireValue(item.port >= 1, 'SRV port required');
      }
      if (type === 'CAA') { item.flag = Number(input.flag ?? input.flags ?? 0); item.tag = String(input.tag || 'issue'); }
      for (const field of ['priority', 'preference', 'weight', 'port', 'flag']) if (item[field] !== undefined) requireValue(Number.isInteger(item[field]) && item[field] >= 0 && item[field] <= 65535, 'Invalid structured DNS field');
      if (type === 'CAA') requireValue(item.flag <= 255 && /^[a-z0-9-]{1,32}$/i.test(item.tag), 'Invalid CAA fields');
      return this.request(path, 'PUT', { force: input.force === true, items: [item] });
    }
    if (id && !/^[a-zA-Z0-9]+$/.test(id)) throw new Error('Invalid record ID');
    const type = String(input.type || '').toUpperCase();
    const name = String(input.name ?? '');
    const structured = input.data || {};
    const content = String(input.content ?? structured.target ?? structured.value ?? structured.certificate ?? '');
    const ttl = Number(input.ttl || 600);
    const allowed = this.provider === 'cloudflare' ? ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'TLSA', 'HTTPS', 'SVCB'] : ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];
    if (!remove && (!allowed.includes(type) || name.length > 253 || /[\s/]/.test(name) || !content || content.length > 4096 || !Number.isInteger(ttl) || (ttl !== 1 && (ttl < 60 || ttl > 86400)))) throw invalid('Invalid DNS record');
    const priority = Number(input.priority ?? structured.priority ?? 0);
    if (!Number.isInteger(priority) || priority < 0 || priority > 65535) throw new Error('Invalid priority');
    if (this.provider === 'porkbun') {
      let relative = name === '@' || name === domain.name ? '' : name;
      if (relative.endsWith(`.${domain.name}`)) relative = relative.slice(0, -domain.name.length - 1);
      const path = `/dns/${remove ? 'delete' : id ? 'edit' : 'create'}/${encodeURIComponent(domain.name)}${id ? `/${id}` : ''}`;
      return this.request(path, 'POST', remove ? {} : { name: relative, type, content, ttl: String(Math.max(ttl, 600)), prio: String(priority) });
    }
    if (!/^[a-f0-9]{32}$/i.test(domain.remote_id)) throw new Error('Sync Cloudflare zones first');
    const fullName = name === '@' ? domain.name : name === domain.name || name.endsWith(`.${domain.name}`) ? name : `${name}.${domain.name}`;
    let data;
    if (type === 'SRV') {
      const labels = fullName.split('.');
      data = { service: labels[0], proto: labels[1], name: labels.slice(2).join('.'), priority, weight: Number(input.weight ?? structured.weight ?? 0), port: Number(input.port ?? structured.port ?? 0), target: content };
      requireValue(/^_[a-z0-9-]+$/i.test(data.service) && /^_(tcp|udp|tls)$/i.test(data.proto) && Number.isInteger(data.port) && data.port >= 0 && data.port <= 65535 && Number.isInteger(data.weight) && data.weight >= 0 && data.weight <= 65535, 'Invalid SRV fields');
    }
    if (type === 'CAA') data = { flags: Number(input.flag ?? structured.flags ?? 0), tag: String(input.tag ?? structured.tag ?? 'issue'), value: content };
    if (type === 'CAA' && !remove) requireValue(Number.isInteger(data.flags) && data.flags >= 0 && data.flags <= 255 && /^[a-z0-9-]{1,32}$/i.test(data.tag), 'Invalid CAA fields');
    if (type === 'TLSA') {
      data = { usage: Number(structured.usage), selector: Number(structured.selector), matching: Number(structured.matching), certificate: String(structured.certificate || '') };
      if (!remove) requireValue([0, 1, 2, 3].includes(data.usage) && [0, 1].includes(data.selector) && [0, 1, 2].includes(data.matching) && /^[a-f\d]+$/i.test(data.certificate) && data.certificate.length % 2 === 0, 'Invalid TLSA fields');
    }
    if (['HTTPS', 'SVCB'].includes(type)) {
      data = { priority, target: String(structured.target || '.'), value: String(structured.value || '') };
      if (!remove) requireValue(data.target.length <= 253 && !/[\s/]/.test(data.target) && data.value.length <= 4096, 'Invalid HTTPS/SVCB fields');
    }
    return this.request(`/zones/${domain.remote_id}/dns_records${id ? `/${id}` : ''}`, remove ? 'DELETE' : id ? 'PATCH' : 'POST', remove ? undefined : { type, name: fullName, ...(data ? { data } : { content }), ttl, ...(type === 'MX' ? { priority } : {}), ...(typeof input.proxied === 'boolean' && ['A', 'AAAA', 'CNAME'].includes(type) ? { proxied: input.proxied } : {}), ...(input.comment ? { comment: String(input.comment).slice(0, 500) } : {}) });
  }

  async execute(operation, variables = {}) {
    const name = variables.domain ? encodeURIComponent(domainName(variables.domain)) : '';
    const input = variables.input || {};
    const years = variables.years || 1;
    requireValue(Number.isInteger(years) && years >= 1 && years <= 10, 'Years must be between 1 and 10');
    if (this.provider === 'spaceship') {
      const routes = {
        test: ['GET', '/domains?take=1&skip=0'],
        getDomain: ['GET', `/domains/${name}`],
        availability: ['GET', `/domains/${name}/available`],
        pricing: ['GET', `/domains/${name}/pricing`],
        register: ['POST', `/domains/${name}`, input],
        renew: ['POST', `/domains/${name}/renew`, { years, currentExpirationDate: input.currentExpirationDate }],
        transfer: ['POST', `/domains/${name}/transfer`, input],
        transferInfo: ['GET', `/domains/${name}/transfer`],
        setAutoRenew: ['PUT', `/domains/${name}/autorenew`, { isEnabled: variables.isEnabled }],
        setNameservers: ['PUT', `/domains/${name}/nameservers`, { provider: input.provider || 'custom', ...(input.hosts ? { hosts: input.hosts } : {}) }],
        getAuthCode: ['GET', `/domains/${name}/transfer/auth-code`],
        setTransferLock: ['PUT', `/domains/${name}/transfer/lock`, { isLocked: variables.isLocked }],
        operation: ['GET', `/async-operations/${encodeURIComponent(variables.operationId || '')}`],
        contacts: ['PUT', '/contacts', input],
      };
      const route = routes[operation];
      requireValue(route, 'Spaceship does not expose this operation', 409);
      const result = await this.request(route[1], route[0], route[2]);
      return { result, raw: result, operationId: result.operationId || '', accepted: result.accepted === true };
    }
    if (this.provider === 'porkbun') {
      const routes = {
        test: ['POST', '/ping'], getDomain: ['POST', `/domain/get/${name}`],
        availability: ['POST', `/domain/checkDomain/${name}`], pricing: ['POST', `/domain/checkDomain/${name}`],
        setAutoRenew: ['POST', `/domain/updateAutoRenew/${name}`, { status: variables.isEnabled ? 'on' : 'off' }],
        setNameservers: ['POST', `/domain/updateNs/${name}`, { ns: input.hosts }],
        transferInfo: ['GET', `/domain/getTransfer/${name}`], invoices: ['POST', '/account/invoices'], balance: ['GET', '/account/balance'],
      };
      if (['register', 'renew', 'transfer'].includes(operation)) {
        const price = await this.request(`/domain/checkDomain/${name}`, 'POST');
        const response = price.response || {};
        const amount = operation === 'register' ? response.price : response.additional?.[operation === 'renew' ? 'renewal' : 'transfer']?.price;
        requireValue(/^\d+(?:\.\d{1,2})?$/.test(String(amount)), 'Porkbun did not return a valid price', 502);
        const [whole, fraction = ''] = String(amount).split('.');
        const cents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
        requireValue(Number.isSafeInteger(cents) && (variables.expectedAmount === undefined || Number(amount) === Number(variables.expectedAmount)), 'Price changed; query a new quote', 409);
        const path = `/domain/${operation === 'register' ? 'create' : operation}/${name}`;
        const payload = { cost: cents * (operation === 'transfer' ? 1 : years), ...(operation !== 'transfer' ? { years: String(years) } : {}), ...(operation === 'register' ? { agreeToTerms: '1' } : {}), ...(operation === 'transfer' ? { authCode: input.authCode } : {}) };
        const result = await this.request(path, 'POST', payload);
        return { result, raw: result };
      }
      const route = routes[operation];
      requireValue(route, 'Porkbun does not expose this operation', 409);
      const raw = await this.request(route[1], route[0], route[2]);
      return { raw, result: raw.response || raw.domain || raw.invoices || raw };
    }
    const account = `/accounts/${this.credentials.accountId}`;
    const routes = {
      test: ['GET', '/user/tokens/verify'],
      registrations: ['GET', `${account}/registrar/registrations?per_page=50&page=${Number(variables.page || 1)}`],
      getDomain: ['GET', `${account}/registrar/registrations/${name}`],
      availability: ['POST', `${account}/registrar/domain-check`, { domains: [variables.domain] }],
      pricing: ['POST', `${account}/registrar/domain-check`, { domains: [variables.domain] }],
      setAutoRenew: ['PATCH', `${account}/registrar/registrations/${name}`, { auto_renew: variables.isEnabled }],
      setTransferLock: ['PATCH', `${account}/registrar/registrations/${name}`, { locked: variables.isLocked }],
      payments: ['GET', `${account}/billing/profile`], invoices: ['GET', `${account}/billing/history?per_page=50`],
      purge: ['POST', `/zones/${encodeURIComponent(variables.zoneId || '')}/purge_cache`, { purge_everything: true }],
    };
    const route = routes[operation];
    requireValue(route, 'Cloudflare does not expose this operation; use its dashboard', 409);
    const raw = await this.request(route[1], route[0], route[2]);
    return { raw, result: raw.result };
  }
}
