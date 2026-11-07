import { randomUUID } from 'node:crypto';
import { requireValue } from './errors.js';
import { adapterFor } from './registry.js';
import { audit, saveSetting, text, transaction } from './store.js';

export const paymentTypes = ['card', 'paypal', 'alipay', 'wechat', 'balance', 'bank', 'crypto', 'other'];

function normalize(body) {
  requireValue(paymentTypes.includes(body.type), 'Invalid payment type');
  const name = text(body.name || '', 100);
  requireValue(name, 'Payment name required');
  requireValue(!body.number && !body.cvv && !body.cvc && !body.password, 'Full payment credentials must not be stored');
  const last4 = String(body.last4 || body.account || '').replace(/\s/g, '');
  requireValue(body.type !== 'card' || /^\d{0,4}$/.test(last4), 'Store only the last four card digits');
  requireValue(!body.status || ['active', 'disabled'].includes(body.status), 'Invalid payment status');
  return { name, type: body.type, status: body.status || 'active', last4: body.type === 'card' ? last4 : text(last4, 200), holder: text(body.holder || '', 100), expiry: text(body.expiry || '', 20), notes: text(body.notes || '', 1000) };
}

export async function financeResource(database, context) {
  const { path, method, body, user } = context;
  const log = (action, target) => audit(database, user, action, target);
  if (path === '/api/v1/payment-types' && method === 'GET') return paymentTypes;
  if (path === '/api/v1/payments' && method === 'GET') return database.prepare('SELECT * FROM payments ORDER BY is_default DESC,name').all().map((row) => ({ id: row.id, ...JSON.parse(row.details_json), isDefault: Boolean(row.is_default), source: 'manual' }));
  const paymentMatch = /^\/api\/v1\/payments\/([a-zA-Z0-9-]+)(?:\/(default))?$/.exec(path);
  if ((path === '/api/v1/payments' && method === 'POST') || (paymentMatch && !paymentMatch[2] && ['PUT', 'PATCH'].includes(method))) {
    const data = normalize(body);
    const id = paymentMatch?.[1] || randomUUID();
    if (paymentMatch) requireValue(database.prepare('SELECT id FROM payments WHERE id=?').get(id), 'Payment not found', 404);
    database.prepare('INSERT INTO payments(id,name,type,details_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,details_json=excluded.details_json').run(id, data.name, data.type, JSON.stringify(data));
    log('payment.save', data.name);
    return { id };
  }
  if (paymentMatch && method === 'DELETE') {
    database.prepare('DELETE FROM payments WHERE id=?').run(paymentMatch[1]);
    log('payment.delete', paymentMatch[1]);
    return { ok: true };
  }
  if (paymentMatch?.[2] === 'default' && method === 'POST') {
    requireValue(database.prepare('SELECT id FROM payments WHERE id=?').get(paymentMatch[1]), 'Payment not found', 404);
    transaction(database, () => {
      database.prepare('UPDATE payments SET is_default=0').run();
      database.prepare('UPDATE payments SET is_default=1 WHERE id=?').run(paymentMatch[1]);
      log('payment.default', paymentMatch[1]);
    });
    return { ok: true };
  }
  if (path === '/api/v1/payments/verify' && method === 'POST') {
    const id = body.paymentMethodId || body.id;
    const saved = id ? database.prepare('SELECT details_json FROM payments WHERE id=?').get(id) : null;
    requireValue(!id || saved, 'Payment not found', 404);
    const payment = normalize(saved ? JSON.parse(saved.details_json) : body);
    const issues = [];
    if (!payment.last4) issues.push('Account reference is required');
    if (payment.type === 'card') {
      if (!/^\d{4}$/.test(payment.last4)) issues.push('Four card digits required');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payment.expiry)) issues.push('Expiry must use YYYY-MM');
      else if (payment.expiry < new Date().toISOString().slice(0, 7)) issues.push('Card has expired');
    }
    return { valid: issues.length === 0, ok: issues.length === 0, issues, payment, note: 'Local validation only; does not charge or authenticate a card.' };
  }
  if (['/api/v1/payments/capabilities', '/api/v1/payments/probe'].includes(path)) return { providers: [
    { provider: 'cloudflare', payments: true, invoices: true, note: 'Read-only billing profile. No card verification or charge API.' },
    { provider: 'porkbun', payments: false, invoices: true, balance: true, note: 'Charges use provider balance/default payment method.' },
    { provider: 'spaceship', payments: false, invoices: false, note: 'No public billing API. Use manual bookkeeping.' },
  ] };
  const kind = path === '/api/v1/invoices' ? 'invoices' : path === '/api/v1/accounts/balances' ? 'balance' : path === '/api/v1/payments/sync' ? 'payments' : '';
  if (kind && (method === 'GET' || method === 'POST')) {
    const results = [];
    const notes = [];
    for (const bound of database.prepare('SELECT id,name,provider,provider_ref FROM connections WHERE enabled=1').all()) {
      try {
        const { adapter } = adapterFor(database, context, bound.id);
        const data = (await adapter.execute(kind)).result;
        if (kind === 'payments') {
          for (const item of Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [data]) {
            const last4 = String(item.last4 || item.card_number || item.account || '').replace(/\D/g, '').slice(-4);
            if (last4) results.push({ id: `synced-${bound.id}-${results.length}`, name: `${bound.name} · ${last4}`, connectionId: bound.id, connectionName: bound.name, source: bound.provider_ref || bound.provider, type: 'card', last4, expiry: item.expiry || (item.card_expiry_year ? `${item.card_expiry_year}-${String(item.card_expiry_month).padStart(2, '0')}` : ''), editable: false });
          }
        } else if (kind === 'balance') results.push({ connectionId: bound.id, connectionName: bound.name, amount: data.balance ?? data.amount, currency: data.currency || 'USD', display: data.display || '' });
        else {
          for (const item of Array.isArray(data) ? data : data.items || data.invoices || []) results.push({ connectionId: bound.id, connectionName: bound.name, id: String(item.invoiceId || item.invoice_id || item.id), amount: item.amount ?? (item.total_cents !== undefined ? Number(item.total_cents) / 100 : null), currency: item.currency || 'USD', status: item.status || item.state || 'unknown', occurredAt: item.occurred_at || item.date || '', url: item.hosted_invoice_url || item.url || '', description: item.description || 'Provider invoice' });
        }
      } catch { notes.push({ connectionId: bound.id, connectionName: bound.name, message: 'Not exposed by provider or request rejected' }); }
    }
    const result = { items: results, notes, syncedAt: new Date().toISOString() };
    if (kind === 'payments') saveSetting(database, 'synced-payments', result);
    return result;
  }
}
