import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { sendEmail } from '../src/smtp.js';

function mailFixture(port, rejectUpgrade = false) {
  const commands = [];
  const sockets = [];
  let authentication = 0;
  let secure = false;
  const create = (encrypted, greeting) => {
    const socket = new EventEmitter();
    sockets.push(socket);
    socket.destroy = () => {};
    socket.write = (line) => {
      commands.push({ line, secure });
      let code = '250 accepted';
      if (line.startsWith('STARTTLS')) code = rejectUpgrade ? '454 unavailable' : '220 upgrade';
      else if (line.startsWith('AUTH LOGIN')) { assert.ok(secure); authentication = 1; code = '334 username'; }
      else if (authentication === 1) { authentication = 2; code = '334 password'; }
      else if (authentication === 2) { authentication = 0; code = '235 authenticated'; }
      else if (line.startsWith('DATA')) code = '354 send message';
      else if (line.startsWith('QUIT')) code = '221 goodbye';
      queueMicrotask(() => socket.emit('data', Buffer.from(`${code}\r\n`)));
    };
    queueMicrotask(() => {
      if (encrypted) secure = true;
      socket.emit(encrypted ? 'secureConnect' : 'connect');
      if (greeting) socket.emit('data', Buffer.from('220 example SMTP\r\n'));
    });
    return socket;
  };
  const network = {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    tcpConnect: (options) => { assert.equal(options.host, '8.8.8.8'); return create(false, true); },
    tlsConnect: (options) => {
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.servername, 'smtp.example.com');
      if (port === 465) assert.equal(options.host, '8.8.8.8');
      else assert.equal(options.socket, sockets[0]);
      return create(true, port === 465);
    },
  };
  return { commands, network };
}

for (const port of [465, 587]) test(`SMTP ${port} verifies TLS, pins public IP and authenticates only after encryption`, async () => {
  const { network, commands } = mailFixture(port);
  await sendEmail({ host: 'smtp.example.com', port, user: 'sender@example.com', pass: 'dummy-password', from: 'DomainDeck <sender@example.com>', to: 'recipient@example.com' }, { title: '到期提醒', text: 'example.com\n.\nExpires soon' }, network);
  assert.equal(commands.filter((item) => item.line.startsWith('AUTH LOGIN')).length, 1);
  assert.equal(commands.filter((item) => item.line.startsWith('STARTTLS')).length, port === 587 ? 1 : 0);
  const message = commands.find((item) => item.line.startsWith('From:')).line;
  assert.match(message, /Subject: =\?UTF-8\?B\?/);
  assert.match(message, /Content-Transfer-Encoding: base64/);
  assert.ok(!message.includes('Expires soon'));
});

test('SMTP rejects STARTTLS downgrade and mixed public/private DNS results', async () => {
  const config = { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'dummy', to: 'recipient@example.com' };
  const { network, commands } = mailFixture(587, true);
  await assert.rejects(sendEmail(config, { title: 'test', text: 'test' }, network), /SMTP command rejected/);
  assert.ok(!commands.some((item) => item.line.startsWith('AUTH')));
  await assert.rejects(sendEmail(config, { title: 'test', text: 'test' }, { lookup: async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }] }), /public addresses/);
});
