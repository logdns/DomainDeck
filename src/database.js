import { DatabaseSync } from 'node:sqlite';

const migrations = [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json))
  ) STRICT`,
  `CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  ) STRICT`,
  `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin', 'viewer'));
  CREATE TABLE connections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('porkbun','cloudflare','spaceship')),
    credentials TEXT NOT NULL, created_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE domains (
    id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
    remote_id TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL DEFAULT '',
    auto_renew INTEGER NOT NULL DEFAULT 0 CHECK(auto_renew IN (0,1)), notes TEXT NOT NULL DEFAULT ''
  ) STRICT;
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL, action TEXT NOT NULL,
    target TEXT NOT NULL, created_at TEXT NOT NULL
  ) STRICT;`,
  `ALTER TABLE connections ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));
  ALTER TABLE connections ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1));
  ALTER TABLE connections ADD COLUMN provider_ref TEXT NOT NULL DEFAULT '';
  CREATE UNIQUE INDEX connections_one_default ON connections(is_default) WHERE is_default=1;
  ALTER TABLE domains ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json));
  CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, permissions_json TEXT NOT NULL CHECK(json_valid(permissions_json))) STRICT;
  CREATE TABLE user_roles (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY(user_id,role_id)) STRICT;
  CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  CREATE TABLE provider_manifests (id TEXT PRIMARY KEY, manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json))) STRICT;
  CREATE TABLE payments (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, details_json TEXT NOT NULL CHECK(json_valid(details_json)), is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1))) STRICT;
  CREATE TABLE orders (id TEXT PRIMARY KEY, connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL, domain TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, operation_id TEXT NOT NULL DEFAULT '', details_json TEXT NOT NULL CHECK(json_valid(details_json)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, request_id TEXT UNIQUE) STRICT;
  CREATE TABLE notification_channels (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), config TEXT NOT NULL) STRICT;
  CREATE TABLE notification_log (id INTEGER PRIMARY KEY, channel_id TEXT NOT NULL, subject TEXT NOT NULL, ok INTEGER NOT NULL CHECK(ok IN (0,1)), message TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
  CREATE TABLE notification_sent (dedupe_key TEXT PRIMARY KEY, sent_at TEXT NOT NULL) STRICT;`,
];

export function migrate(database) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const { user_version: version } = database.prepare('PRAGMA user_version').get();
    if (version > migrations.length) {
      throw new Error(`Unsupported database version: ${version}`);
    }
    for (let index = version; index < migrations.length; index += 1) {
      database.exec(migrations[index]);
      database.exec(`PRAGMA user_version = ${index + 1}`);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(path) {
  const database = new DatabaseSync(path, { timeout: 5000 });
  try {
    database.exec('PRAGMA foreign_keys = ON');
    migrate(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
