PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_path TEXT NOT NULL,
  current_revision INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  object_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sites_account_idx ON sites(account_id);
CREATE TABLE IF NOT EXISTS revisions (
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, revision),
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS objects (
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  object_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  encoding TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  PRIMARY KEY (site_id, revision, object_id),
  UNIQUE (site_id, revision, path),
  FOREIGN KEY (site_id, revision) REFERENCES revisions(site_id, revision) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS object_chunks (
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  object_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  PRIMARY KEY (site_id, revision, object_id, chunk_index),
  FOREIGN KEY (site_id, revision, object_id) REFERENCES objects(site_id, revision, object_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS uploads (
  upload_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  format_version INTEGER NOT NULL,
  chunk_protocol_version INTEGER NOT NULL,
  expected_chunk_count INTEGER NOT NULL,
  expected_object_count INTEGER NOT NULL,
  declared_bytes INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  result_json TEXT,
  UNIQUE (account_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS uploads_expiry_idx ON uploads(status, expires_at);
CREATE TABLE IF NOT EXISTS upload_objects (
  upload_id TEXT NOT NULL REFERENCES uploads(upload_id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  encoding TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, object_id),
  UNIQUE (upload_id, path)
);
CREATE TABLE IF NOT EXISTS upload_chunks (
  upload_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  PRIMARY KEY (upload_id, object_id, chunk_index),
  FOREIGN KEY (upload_id, object_id) REFERENCES upload_objects(upload_id, object_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS device_authorizations (
  id TEXT PRIMARY KEY,
  device_code_hash TEXT NOT NULL UNIQUE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  token_name TEXT
);
CREATE INDEX IF NOT EXISTS device_authorizations_expiry_idx ON device_authorizations(status, expires_at);
CREATE TABLE IF NOT EXISTS bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consumed_at TEXT
);
INSERT OR IGNORE INTO bootstrap_state(id, consumed_at) VALUES (1, NULL);
