import { createHmac, randomUUID } from 'node:crypto';
import { requireValue } from './errors.js';
import { publicRequest, publicURL } from './network.js';
import { decrypt, encrypt } from './vault.js';
import { audit, saveSetting, setting, text, transaction } from './store.js';
import { mailAddress, sendEmail } from './smtp.js';

export const channelTypes = ['email', 'telegram', 'wecom', 'bark', 'feishu', 'dingtalk', 'webhook'];
const channelFields = {
  email: ['host', 'port', 'user', 'pass', 'from', 'to'], telegram: ['botToken', 'chatId'],
  wecom: ['webhook'], bark: ['server', 'deviceKey', 'group'], feishu: ['webhook'], dingtalk: ['webhook', 'secret'], webhook: ['url', 'headers'],
};

function validateChannel(type, config) {
  requireValue(channelTypes.includes(type), 'Invalid notification channel');
  requireValue(config && typeof config === 'object' && Object.values(config).every((value) => typeof value === 'string' && value.length <= 4000), 'Invalid channel configuration');
  if (type === 'email') {
    requireValue(typeof config.host === 'string' && config.host.length > 0 && [465, 587].includes(Number(config.port || 465)), 'SMTP host and TLS port required');
    mailAddress(config.from || config.user);
    for (const address of String(config.to || '').split(/[;,]/)) mailAddress(address.trim());
  } else if (type === 'telegram') requireValue(/^\d+:[A-Za-z0-9_-]+$/.test(config.botToken || '') && /^-?\d+$/.test(config.chatId || ''), 'Invalid Telegram bot token or chat ID');
  else if (type === 'bark') { publicURL(config.server || 'https://api.day.app'); requireValue(config.deviceKey, 'Bark device key required'); }
  else {
    const url = publicURL(config.webhook || config.url);
    const hosts = { wecom: 'qyapi.weixin.qq.com', feishu: 'open.feishu.cn', dingtalk: 'oapi.dingtalk.com' };
    requireValue(!hosts[type] || url.hostname === hosts[type], 'Webhook host does not match channel');
    if (config.headers) {
      const headers = JSON.parse(config.headers);
      requireValue(headers && !Array.isArray(headers) && typeof headers === 'object' && Object.entries(headers).every(([field, value]) => /^[a-zA-Z0-9-]+$/.test(field) && !['host', 'content-length', 'connection'].includes(field.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)), 'Invalid webhook headers');
    }
  }
}

export async function deliver(channel, message, transport = publicRequest, mailSender = sendEmail) {
  const config = channel.config;
  validateChannel(channel.type, config);
  if (channel.type === 'email') return mailSender(config, message);
  let target;
  let body;
  let headers = {};
  if (channel.type === 'telegram') {
    target = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    body = { chat_id: config.chatId, text: `${message.title}\n${message.text}` };
  } else if (channel.type === 'bark') {
    target = `${(config.server || 'https://api.day.app').replace(/\/$/, '')}/push`;
    body = { device_key: config.deviceKey, title: message.title, body: message.text, group: config.group || 'DomainDeck' };
  } else if (channel.type === 'wecom') {
    target = config.webhook; body = { msgtype: 'text', text: { content: `${message.title}\n${message.text}` } };
  } else if (channel.type === 'feishu') {
    target = config.webhook; body = { msg_type: 'text', content: { text: `${message.title}\n${message.text}` } };
  } else if (channel.type === 'dingtalk') {
    const url = new URL(config.webhook);
    if (config.secret) {
      const timestamp = String(Date.now());
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('sign', createHmac('sha256', config.secret).update(`${timestamp}\n${config.secret}`).digest('base64'));
    }
    target = url.href; body = { msgtype: 'text', text: { content: `${message.title}\n${message.text}` } };
  } else {
    target = config.url; body = { ...message, source: 'DomainDeck', sentAt: new Date().toISOString() };
    headers = config.headers ? JSON.parse(config.headers) : {};
  }
  const response = await transport(target, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
  requireValue(response.ok, 'Notification endpoint rejected request', 502);
  const raw = await response.text();
  requireValue(raw.length < 1024 * 1024, 'Notification response too large', 502);
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { requireValue(channel.type === 'webhook', 'Invalid notification response', 502); }
  requireValue(result.ok !== false && (!Object.hasOwn(result, 'errcode') || result.errcode === 0) && (!Object.hasOwn(result, 'code') || [0, 200].includes(result.code)), 'Notification service returned an error', 502);
  return { ok: true };
}

export function createNotificationService(database, context) {
  let running = false;
  const channels = () => database.prepare('SELECT * FROM notification_channels WHERE enabled=1').all().map((row) => ({ ...row, config: decrypt(context.key, row.config) }));
  const send = async (channel, message) => {
    let ok = true;
    try { await deliver(channel, message, context.notificationTransport, context.mailSender); } catch { ok = false; }
    database.prepare('INSERT INTO notification_log(channel_id,subject,ok,message,created_at) VALUES(?,?,?,?,?)').run(channel.id, message.title.slice(0, 200), Number(ok), ok ? 'Delivered' : 'Delivery failed; verify channel credentials and permissions', new Date().toISOString());
    database.prepare('DELETE FROM notification_log WHERE id NOT IN (SELECT id FROM notification_log ORDER BY id DESC LIMIT 500)').run();
    return { channelId: channel.id, ok };
  };
  return {
    async test(id) {
      const selected = channels().filter((channel) => !id || id === channel.id);
      requireValue(selected.length, 'No enabled notification channels');
      const result = [];
      for (const channel of selected) result.push(await send(channel, { title: 'DomainDeck test', text: 'Notification channel test.' }));
      return result;
    },
    async run(force = false) {
      requireValue(!running, 'Notification check already running', 409);
      running = true;
      try {
        const rules = setting(database, 'notifications');
        if (!rules.enabled) return { checked: 0, sent: 0, disabled: true };
        const targets = channels();
        const domains = database.prepare("SELECT name,expires_at FROM domains WHERE expires_at!=''").all();
        let sent = 0;
        for (const domain of domains) {
          const days = Math.ceil((Date.parse(domain.expires_at) - Date.now()) / 86400000);
          if (!Number.isFinite(days) || days < 0 || !rules.expiryDays.some((threshold) => days <= threshold)) continue;
          const threshold = [...rules.expiryDays].sort((first, second) => first - second).find((value) => days <= value);
          if (!force && database.prepare('SELECT dedupe_key FROM notification_sent WHERE dedupe_key=?').get(`legacy|${domain.name}|${domain.expires_at.slice(0, 10)}|${threshold}`)) continue;
          for (const channel of targets) {
            const dedupe = `${domain.name}|${domain.expires_at}|${threshold}|${channel.id}`;
            if (!force && database.prepare('SELECT dedupe_key FROM notification_sent WHERE dedupe_key=?').get(dedupe)) continue;
            const result = await send(channel, { title: 'DomainDeck expiry reminder', text: `${domain.name} expires ${domain.expires_at} (${days} days).` });
            if (result.ok) { database.prepare('INSERT OR IGNORE INTO notification_sent VALUES(?,?)').run(dedupe, new Date().toISOString()); sent += 1; }
          }
        }
        saveSetting(database, 'notifications-last', { checkedAt: new Date().toISOString(), checked: domains.length, sent });
        return { checked: domains.length, sent };
      } finally { running = false; }
    },
    async renewal(name) {
      if (!setting(database, 'notifications').notifyOnRenew) return;
      for (const channel of channels()) await send(channel, { title: 'DomainDeck renewal submitted', text: `Renewal submitted for ${name}. Verify completion in orders.` });
    },
  };
}

export async function notificationResource(database, context) {
  const { path, method, body, user } = context;
  const service = context.notifications || createNotificationService(database, context);
  if (path === '/api/v1/notifications' && method === 'GET') return {
    ...setting(database, 'notifications'), lastResult: setting(database, 'notifications-last'), channelTypes, channelFields,
    channels: database.prepare('SELECT * FROM notification_channels ORDER BY name').all().map((row) => {
      const config = decrypt(context.key, row.config);
      const safe = ['host', 'port', 'user', 'from', 'to', 'chatId', 'group'];
      return { id: row.id, name: row.name, type: row.type, enabled: Boolean(row.enabled), config: Object.fromEntries(Object.entries(config).filter(([field]) => safe.includes(field))), configuredFields: Object.keys(config).filter((field) => config[field]) };
    }),
  };
  if (path === '/api/v1/notifications' && method === 'PUT') {
    const expiryDays = body.expiryDays || body.rules?.expiryDays || setting(database, 'notifications').expiryDays;
    requireValue(Array.isArray(expiryDays) && expiryDays.length > 0 && expiryDays.length <= 20 && expiryDays.every((value) => Number.isInteger(value) && value > 0 && value <= 365), 'Invalid expiry thresholds');
    requireValue(!body.channels || Array.isArray(body.channels) && body.channels.length <= 20, 'Invalid channels');
    transaction(database, () => {
      saveSetting(database, 'notifications', { enabled: body.enabled === true, expiryDays: [...new Set(expiryDays)], notifyOnRenew: body.notifyOnRenew === true || body.rules?.notifyOnRenew === true });
      if (body.channels) {
        const preserved = new Set();
        for (const channel of body.channels) {
          const old = channel.id ? database.prepare('SELECT * FROM notification_channels WHERE id=?').get(channel.id) : null;
          const config = Object.fromEntries(Object.entries({ ...(old?.type === channel.type ? decrypt(context.key, old.config) : {}), ...(channel.config || {}) }).filter(([field]) => channelFields[channel.type]?.includes(field)));
          validateChannel(channel.type, config);
          const id = old?.id || randomUUID();
          database.prepare('INSERT INTO notification_channels VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,enabled=excluded.enabled,config=excluded.config').run(id, text(channel.name || channel.type, 100), channel.type, Number(channel.enabled !== false), encrypt(context.key, config));
          preserved.add(id);
        }
        for (const row of database.prepare('SELECT id FROM notification_channels').all()) if (!preserved.has(row.id)) database.prepare('DELETE FROM notification_channels WHERE id=?').run(row.id);
      }
      audit(database, user, 'notifications.save', 'settings');
    });
    return { ok: true };
  }
  if (path === '/api/v1/notifications/log' && method === 'GET') return database.prepare('SELECT * FROM notification_log ORDER BY id DESC LIMIT 200').all();
  if (path === '/api/v1/notifications/test' && method === 'POST') return service.test(body.channelId);
  if (path === '/api/v1/notifications/run' && method === 'POST') return service.run(body.force === true);
}
