CREATE TABLE t_personal_oauth_refresh (
  connection_id TEXT PRIMARY KEY REFERENCES t_external_provider_connection(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  credential_version TEXT NOT NULL,
  claim_token TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ(3) NOT NULL,
  dispatched_at TIMESTAMPTZ(3)
);
