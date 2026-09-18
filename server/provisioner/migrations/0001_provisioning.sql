CREATE TABLE IF NOT EXISTS provision_jobs (
  job_id TEXT PRIMARY KEY,
  poll_secret_hash TEXT NOT NULL,
  oauth_state_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL,
  account_id TEXT,
  access_token_ciphertext TEXT,
  result_ciphertext TEXT,
  installation_id TEXT,
  error_code TEXT,
  error_message TEXT,
  acked_at TEXT
);
CREATE INDEX IF NOT EXISTS provision_jobs_expiry_idx ON provision_jobs(state, expires_at);
CREATE TABLE IF NOT EXISTS cloudflare_installations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  worker_name TEXT NOT NULL,
  d1_database_id TEXT NOT NULL,
  d1_database_name TEXT NOT NULL,
  r2_bucket_name TEXT NOT NULL,
  service_url TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
