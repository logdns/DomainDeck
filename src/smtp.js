import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { lookup } from 'node:dns/promises';
import { once } from 'node:events';
import { publicAddress } from './network.js';
import { requireValue } from './errors.js';

export function mailAddress(value) {
  const match = /^(?:[^<>\r\n]+\s*<)?([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>?$/.exec(value || '');
  requireValue(match && !/[\r\n]/.test(value), 'Invalid email address');
  return match[1];
}

function replies(socket) {
  let buffer = '';
  let failure;
  let waiter;
  const queued = [];
  const flush = () => {
    if (!waiter) return;
    if (failure) { const pending = waiter; waiter = null; pending.reject(failure); }
    else if (queued.length) { const pending = waiter; waiter = null; pending.resolve(queued.shift()); }
  };
  const data = (chunk) => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 65536) { failure = new Error('SMTP response too large'); socket.destroy(); flush(); return; }
    let index;
    while ((index = buffer.indexOf('\r\n')) >= 0) {
      queued.push(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      if (queued.length > 100) { failure = new Error('SMTP response limit'); socket.destroy(); break; }
    }
    flush();
  };
  const failed = () => { failure = new Error('SMTP connection closed'); flush(); };
  socket.on('data', data);
  socket.on('error', failed);
  socket.on('close', failed);
  return {
    async read(expected) {
      for (let count = 0; count < 100; count += 1) {
        const line = await new Promise((resolve, reject) => { waiter = { resolve, reject }; flush(); });
        requireValue(/^\d{3}[- ]/.test(line), 'Invalid SMTP response', 502);
        if (line[3] === ' ') { requireValue(expected.includes(Number(line.slice(0, 3))), 'SMTP command rejected', 502); return; }
      }
      throw new Error('SMTP response limit');
    },
    detach() { socket.off('data', data); socket.off('error', failed); socket.off('close', failed); },
  };
}

export async function sendEmail(config, message, network = {}) {
  const from = mailAddress(config.from || config.user);
  const recipients = String(config.to || '').split(/[;,]/).map((value) => mailAddress(value.trim()));
  requireValue(recipients.length <= 20, 'Too many email recipients');
  const port = Number(config.port || 465);
  requireValue([465, 587].includes(port), 'Use SMTP TLS 465 or STARTTLS 587');
  const addresses = await (network.lookup || lookup)(config.host, { all: true });
  requireValue(addresses.length && addresses.every((entry) => publicAddress(entry.address)), 'SMTP must resolve to public addresses');
  const secureConnect = network.tlsConnect || tlsConnect;
  let socket = port === 465 ? secureConnect({ host: addresses[0].address, port, servername: config.host, rejectUnauthorized: true }) : (network.tcpConnect || tcpConnect)({ host: addresses[0].address, port });
  const deadline = setTimeout(() => socket.destroy(new Error('SMTP deadline exceeded')), 20000);
  socket.on('error', () => {});
  let reader = replies(socket);
  const command = async (line, expected) => { socket.write(`${line}\r\n`); await reader.read(expected); };
  try {
    await once(socket, port === 465 ? 'secureConnect' : 'connect');
    await reader.read([220]);
    await command('EHLO domaindeck.local', [250]);
    if (port === 587) {
      await command('STARTTLS', [220]);
      reader.detach();
      socket = secureConnect({ socket, servername: config.host, rejectUnauthorized: true });
      socket.on('error', () => {});
      reader = replies(socket);
      await once(socket, 'secureConnect');
      await command('EHLO domaindeck.local', [250]);
    }
    if (config.user) {
      await command('AUTH LOGIN', [334]);
      await command(Buffer.from(config.user).toString('base64'), [334]);
      await command(Buffer.from(config.pass || '').toString('base64'), [235]);
    }
    await command(`MAIL FROM:<${from}>`, [250]);
    for (const recipient of recipients) await command(`RCPT TO:<${recipient}>`, [250, 251]);
    await command('DATA', [354]);
    const content = Buffer.from(message.text).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
    const subject = `=?UTF-8?B?${Buffer.from(message.title).toString('base64')}?=`;
    await command(`From: ${from}\r\nTo: ${recipients.join(', ')}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}\r\n.`, [250]);
    await command('QUIT', [221]);
    return { ok: true };
  } finally { clearTimeout(deadline); socket.destroy(); }
}
