function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

export function domainName(value) {
  if (typeof value !== 'string') throw invalid('Invalid domain');
  const name = value.toLowerCase().replace(/\.$/, '');
  if (name.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(name)) throw invalid('Invalid domain; use punycode for international domains');
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
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('Provider response too large');
    chunks.push(chunk);
  }
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
    const payload = porkbun ? { ...body, apikey: this.credentials.apiKey, secretapikey: this.credentials.secretKey } : body;
    const response = await this.transport(origin + path, {
      method: porkbun ? 'POST' : method, headers,
      body: payload ? JSON.stringify(payload) : undefined,
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const result = response.status === 204 ? {} : await jsonResponse(response);
    if (!response.ok || (!spaceship && (porkbun ? result.status !== 'SUCCESS' : result.success !== true))) {
      throw new Error('Provider rejected request; verify API access and permissions');
    }
    return result;
  }

  async domains() {
    if (this.provider === 'spaceship') {
      const result = [];
      for (let skip = 0; skip < 100000; skip += 100) {
        const data = await this.request(`/domains?take=100&skip=${skip}`);
        for (const item of data.items || []) result.push({ name: domainName(item.name), remoteId: item.name, expiresAt: item.expirationDate || '', autoRenew: item.autoRenew === true });
        if (!(data.items || []).length || result.length >= data.total || data.items.length < 100) return result;
      }
      throw new Error('Provider pagination limit exceeded');
    }
    if (this.provider === 'porkbun') {
      const result = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const data = await this.request('/domain/listAll', 'POST', { start: offset, includeLabels: 'yes' });
        for (const item of data.domains || []) result.push({ name: domainName(item.domain), remoteId: item.domain, expiresAt: item.expireDate || '', autoRenew: ['1', 'true'].includes(String(item.autoRenew)) });
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
        result.push(...(data.items || []).map((item) => ({ ...item, content: item.address || item.value || item.cname || item.exchange || '', name: item.name || item.host || '@' })));
        if (!(data.items || []).length || result.length >= data.total || data.items.length < 100) return result;
      }
      throw new Error('Provider pagination limit exceeded');
    }
    if (this.provider === 'porkbun') {
      const data = await this.request(`/dns/retrieve/${encodeURIComponent(domain.name)}`);
      return (data.records || []).map((record) => ({ ...record, id: String(record.id) }));
    }
    if (!/^[a-f0-9]{32}$/i.test(domain.remote_id)) throw new Error('Sync Cloudflare zones before managing DNS');
    const records = [];
    for (let page = 1; page <= 1000; page += 1) {
      const data = await this.request(`/zones/${domain.remote_id}/dns_records?per_page=100&page=${page}`);
      records.push(...data.result);
      if (page >= (data.result_info?.total_pages || 1)) return records;
    }
    throw new Error('Provider pagination limit exceeded');
  }

  async writeRecord(domain, input, id, remove = false) {
    if (this.provider === 'spaceship') throw new Error('Spaceship DNS is read-only in this release');
    if (id && !/^[a-zA-Z0-9]+$/.test(id)) throw new Error('Invalid record ID');
    const type = String(input.type || '').toUpperCase();
    const name = String(input.name ?? '');
    const content = String(input.content ?? '');
    const ttl = Number(input.ttl || 600);
    if (!remove && (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].includes(type) || name.length > 253 || /[\s/]/.test(name) || !content || content.length > 4096 || !Number.isInteger(ttl) || (ttl !== 1 && (ttl < 60 || ttl > 86400)))) throw new Error('Invalid DNS record');
    const priority = Number(input.priority ?? 0);
    if (!Number.isInteger(priority) || priority < 0 || priority > 65535) throw new Error('Invalid priority');
    if (this.provider === 'porkbun') {
      let relative = name === '@' || name === domain.name ? '' : name;
      if (relative.endsWith(`.${domain.name}`)) relative = relative.slice(0, -domain.name.length - 1);
      const path = `/dns/${remove ? 'delete' : id ? 'edit' : 'create'}/${encodeURIComponent(domain.name)}${id ? `/${id}` : ''}`;
      return this.request(path, 'POST', remove ? {} : { name: relative, type, content, ttl: String(ttl), prio: String(priority) });
    }
    if (!/^[a-f0-9]{32}$/i.test(domain.remote_id)) throw new Error('Sync Cloudflare zones first');
    return this.request(`/zones/${domain.remote_id}/dns_records${id ? `/${id}` : ''}`, remove ? 'DELETE' : id ? 'PUT' : 'POST', remove ? undefined : { type, name: name === '@' ? domain.name : name, content, ttl, ...(type === 'MX' ? { priority } : {}) });
  }
}
