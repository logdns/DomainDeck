import { ManifestProvider, validateManifest } from './manifests.js';
import { Provider } from './providers.js';
import { connection } from './store.js';
import { requireValue } from './errors.js';

export const builtins = [
  { id: 'porkbun', name: 'Porkbun', docs: 'https://porkbun.com/api/json/v3/documentation', credentialsUrl: 'https://porkbun.com/account/api', setup: ['Create API key and secret.', 'Enable API access for each managed domain.'], fields: ['apiKey', 'secretKey'], capabilities: ['domains', 'dns', 'register', 'renew', 'transfer', 'nameservers', 'autorenew', 'invoices', 'balance'] },
  { id: 'spaceship', name: 'Spaceship', docs: 'https://docs.spaceship.dev/', credentialsUrl: 'https://www.spaceship.com/application/api-manager/', setup: ['Create an API key and secret in API Manager.', 'Grant domains:read, dnsrecords:read, and only the write/billing/transfer scopes you need.', 'Grant contacts:write and asyncoperations:read for contacts and asynchronous purchases.'], fields: ['apiKey', 'apiSecret'], capabilities: ['domains', 'dns', 'register', 'renew', 'transfer', 'nameservers', 'autorenew', 'authCode', 'transferLock', 'operations', 'contacts'] },
  { id: 'cloudflare', name: 'Cloudflare', docs: 'https://developers.cloudflare.com/api/', credentialsUrl: 'https://dash.cloudflare.com/profile/api-tokens', setup: ['Create a scoped API token.', 'Copy the account ID; grant Zone/DNS and optional Registrar/Billing permissions.'], fields: ['token', 'accountId'], capabilities: ['domains', 'dns', 'registrations', 'autorenew', 'transferLock', 'purge', 'invoices', 'payments'] },
];

export const presets = [
  {
    id: 'godaddy', name: 'GoDaddy', fields: [{ key: 'apiKey', label: 'API Key', required: true }, { key: 'apiSecret', label: 'API Secret', required: true, secret: true }],
    request: { baseUrl: 'https://api.godaddy.com/v1', format: 'json', auth: { type: 'header', map: { Authorization: 'sso-key {apiKey}:{apiSecret}' } } },
    ops: {
      test: { path: '/domains', query: { limit: '1' } },
      listDomains: { path: '/domains', query: { limit: '1000', statuses: 'ACTIVE', marker: '{cursor}' }, pagination: { pageSize: 1000 }, map: { name: 'domain', expirationDate: 'expires', autoRenew: { path: 'renewAuto', format: 'bool' } } },
      getDomain: { path: '/domains/{domain}' },
      availability: { path: '/domains/available', query: { domain: '{domain}', checkType: 'FULL' }, map: { result: 'available' } },
      renew: { path: '/domains/{domain}/renew', method: 'POST', body: { period: '{years}' } },
      setAutoRenew: { path: '/domains/{domain}', method: 'PATCH', body: { renewAuto: '{isEnabled}' } },
      setNameservers: { path: '/domains/{domain}/nameServers', method: 'PUT', body: { nameServers: '{hosts}' } },
      listDns: { path: '/domains/{domain}/records' },
    },
  },
  {
    id: 'namecheap', name: 'Namecheap', fields: [{ key: 'apiKey', label: 'ApiUser', required: true }, { key: 'apiSecret', label: 'ApiKey', required: true, secret: true }, { key: 'clientIp', label: 'Whitelisted public IP', required: true }],
    request: { baseUrl: 'https://api.namecheap.com/xml.response', format: 'xml', auth: { type: 'query', map: { ApiUser: '{apiKey}', ApiKey: '{apiSecret}', UserName: '{apiKey}', ClientIp: '{clientIp}' } } },
    ops: {
      test: { path: '/', query: { Command: 'namecheap.users.getBalances' } },
      listDomains: { path: '/', query: { Command: 'namecheap.domains.getList', PageSize: '100', Page: '{page}' }, pagination: { pageSize: 100 }, itemsPath: 'ApiResponse.CommandResponse.DomainGetListResult.Domain', map: { name: 'Name', expirationDate: 'Expires', autoRenew: { path: 'AutoRenew', format: 'bool' } } },
      getDomain: { path: '/', query: { Command: 'namecheap.domains.getInfo', DomainName: '{domain}' }, resultPath: 'ApiResponse.CommandResponse.DomainGetInfoResult' },
      renew: { path: '/', query: { Command: 'namecheap.domains.renew', DomainName: '{domain}', Years: '{years}' } },
    },
  },
];

export function providerList(database) {
  const custom = database.prepare('SELECT manifest_json FROM provider_manifests ORDER BY id').all().map((row) => JSON.parse(row.manifest_json));
  const overridden = new Set(custom.map((item) => item.id));
  return [...builtins, ...presets.filter((item) => !overridden.has(item.id)), ...custom].map((item) => ({ id: item.id, name: item.name, docs: item.docs || '', hint: item.hint || '', setup: item.setup || [], credentialsUrl: item.credentialsUrl || '', builtin: builtins.some((entry) => entry.id === item.id), preset: presets.some((entry) => entry.id === item.id) && !overridden.has(item.id), fields: item.fields, capabilities: Array.isArray(item.capabilities) ? item.capabilities : Object.keys(item.ops || {}).filter((operation) => item.capabilities?.[operation] !== false) }));
}

export function manifestFor(database, id) {
  const row = database.prepare('SELECT manifest_json FROM provider_manifests WHERE id=?').get(id);
  return row ? JSON.parse(row.manifest_json) : presets.find((item) => item.id === id);
}

export function adapterFor(database, context, id) {
  const bound = connection(database, id, context.key);
  if (builtins.some((item) => item.id === bound.provider)) return { bound, adapter: new Provider(bound.provider, bound.credentials, context.transport) };
  const manifest = manifestFor(database, bound.provider);
  requireValue(manifest, 'Provider manifest missing', 409);
  return { bound, adapter: new ManifestProvider(manifest, bound.credentials, context.transport) };
}

export function validateCustomCredentials(database, provider, credentials) {
  const manifest = manifestFor(database, provider);
  requireValue(manifest && credentials && typeof credentials === 'object', 'Unknown custom provider');
  validateManifest(manifest);
  return Object.fromEntries(manifest.fields.map((field) => {
    const value = credentials[field.key] || '';
    requireValue(typeof value === 'string' && value.length <= 2048 && (!field.required || value), `Missing credential: ${field.key}`);
    return [field.key, value];
  }));
}
