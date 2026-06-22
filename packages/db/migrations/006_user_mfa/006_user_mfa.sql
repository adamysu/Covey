alter table users
  add column if not exists mfa_secret text,
  add column if not exists mfa_enabled_at timestamptz;
