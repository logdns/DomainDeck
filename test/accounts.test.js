import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticateAccount, createAccount, hashPassword, verifyPassword } from '../src/accounts.js';
import { openDatabase } from '../src/database.js';

test('creates and authenticates accounts without returning the password hash', async () => {
  const database = openDatabase(':memory:');
  try {
    const account = await createAccount(database, { username: 'admin', password: 'example-password' });
    assert.deepEqual(await authenticateAccount(database, 'ADMIN', 'example-password'), account);
    assert.equal(await authenticateAccount(database, 'admin', 'wrong-password'), null);
    await assert.rejects(createAccount(database, { username: 'ADMIN', password: 'another-password' }));
    database.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', account.id);
    assert.equal(await authenticateAccount(database, 'admin', 'example-password'), null);
  } finally {
    database.close();
  }
});

test('uses unique salts and rejects malformed password hashes', async () => {
  const first = await hashPassword('example-password');
  const second = await hashPassword('example-password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('example-password', first), true);
  assert.equal(await verifyPassword('example-password', `${first}x`), false);
  await assert.rejects(hashPassword('short'));
});

test('rejects login when the account is disabled while its password is verified', async () => {
  const database = openDatabase(':memory:');
  try {
    const account = await createAccount(database, { username: 'admin', password: 'example-password' });
    const pending = authenticateAccount(database, 'admin', 'example-password');
    database.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', account.id);
    assert.equal(await pending, null);
  } finally {
    database.close();
  }
});
