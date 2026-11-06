import { adapterFor } from './registry.js';
import { requireValue } from './errors.js';
import { audit } from './store.js';

export async function dnsResource(database, context) {
  const { path, method, query, body, user } = context;
  if (path === '/api/v1/dns/zones' && method === 'GET') {
    const items = [];
    const notes = [];
    for (const bound of database.prepare('SELECT id,name FROM connections WHERE enabled=1').all()) {
      if (query.get('connectionId') && query.get('connectionId') !== bound.id) continue;
      try {
        const { adapter } = adapterFor(database, context, bound.id);
        const domains = await adapter.domains();
        for (const domain of domains) items.push({ id: `${bound.id}:${domain.remoteId}`, name: domain.name, provider: adapter.provider, connectionId: bound.id, connectionName: bound.name, remoteId: domain.remoteId });
      } catch { notes.push({ connectionId: bound.id, message: 'Zone listing unavailable' }); }
    }
    return { items, notes };
  }
  const zoneMatch = /^\/api\/v1\/dns\/zones\/([^/]+)\/(records|purge)(?:\/([a-zA-Z0-9]+))?$/.exec(path);
  if (zoneMatch) {
    const zoneId = decodeURIComponent(zoneMatch[1]);
    const separator = zoneId.indexOf(':');
    requireValue(separator > 0, 'Invalid zone ID');
    const connectionId = zoneId.slice(0, separator);
    const remoteId = zoneId.slice(separator + 1);
    const { adapter } = adapterFor(database, context, connectionId);
    const domain = (await adapter.domains()).find((entry) => entry.remoteId === remoteId);
    requireValue(domain, 'Zone not found in the selected provider account', 404);
    if (zoneMatch[2] === 'purge' && method === 'POST') {
      await adapter.execute('purge', { zoneId: remoteId });
      audit(database, user, 'dns.purge', domain.name);
      return { ok: true };
    }
    const normalized = { name: domain.name, remote_id: remoteId };
    if (method === 'GET') {
      const records = await adapter.records(normalized);
      return records.filter((record) => (!query.get('type') || record.type === query.get('type')) && (!query.get('search') || JSON.stringify(record).toLowerCase().includes(query.get('search').toLowerCase())));
    }
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      requireValue(method !== 'DELETE' || zoneMatch[3], 'Record ID required');
      await adapter.writeRecord(normalized, body, zoneMatch[3], method === 'DELETE');
      audit(database, user, `dns.${method.toLowerCase()}`, domain.name);
      return { ok: true };
    }
  }
  const registrationMatch = /^\/api\/v1\/connections\/([a-zA-Z0-9-]+)\/registrations$/.exec(path);
  if (registrationMatch && ['GET', 'POST'].includes(method)) {
    const { adapter } = adapterFor(database, context, registrationMatch[1]);
    requireValue(adapter.provider === 'cloudflare', 'Only Cloudflare has a separate registrar list');
    const registrations = [];
    for (let page = 1; page <= 100; page += 1) {
      const response = await adapter.execute('registrations', { page });
      registrations.push(...response.result);
      if (page >= (response.raw.result_info?.total_pages || 1)) break;
    }
    if (method === 'POST') {
      const insert = database.prepare(`INSERT INTO domains(id,name,connection_id,expires_at,auto_renew,metadata_json) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at,auto_renew=excluded.auto_renew,metadata_json=excluded.metadata_json WHERE domains.connection_id=excluded.connection_id`);
      database.exec('BEGIN IMMEDIATE');
      try {
        for (const item of registrations) {
          requireValue(typeof item.domain_name === 'string', 'Invalid registrar response', 502);
          insert.run(`cf-${registrationMatch[1]}-${item.domain_name}`, item.domain_name, registrationMatch[1], item.expires_at || '', Number(item.auto_renew === true), JSON.stringify({ status: item.status, locked: item.locked }));
        }
        audit(database, user, 'registrar.sync', registrationMatch[1]);
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    }
    return registrations;
  }
}
