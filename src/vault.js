import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function loadKey(path, allowCreate = true) {
  if (!allowCreate) {
    const key = readFileSync(path);
    if (key.length !== 32) throw new Error('Invalid vault key; restore the original key from backup');
    return key;
  }
  try {
    writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error('Invalid vault key; restore the original key from backup');
  return key;
}

export function encrypt(key, value) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decrypt(key, value) {
  const data = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
}
