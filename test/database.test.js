import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate, openDatabase } from '../src/database.js';

test('initializes the schema and enforces user constraints', () => {
  const database = openDatabase(':memory:');
  try {
    const insert = database.prepare('INSERT INTO users(id,username,password_hash,status,profile_json) VALUES (?, ?, ?, ?, ?)');
    insert.run('one', 'Admin', 'test-hash', 'active', '{}');
    assert.throws(() => insert.run('two', 'admin', 'test-hash', 'active', '{}'));
    assert.throws(() => insert.run('three', 'other', 'test-hash', 'unknown', '{}'));
    assert.throws(() => insert.run('four', 'other', 'test-hash', 'active', 'invalid'));
    migrate(database);
    assert.equal(database.prepare('SELECT count(*) AS count FROM users').get().count, 1);
  } finally {
    database.close();
  }
});

test('rejects databases created by a newer version without modifying them', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA user_version = 999');
    assert.throws(() => migrate(database), /Unsupported database version/);
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 999);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'users'").get().count, 0);
  } finally {
    database.close();
  }
});

test('rolls back a failed migration', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('CREATE TABLE users (id TEXT)');
    assert.throws(() => migrate(database));
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 0);
    assert.equal(database.prepare('PRAGMA table_info(users)').all().length, 1);
  } finally {
    database.close();
  }
});
