create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  trigger_type text not null check (trigger_type in ('MANUAL', 'SCHEDULED')),
  file_name text,
  file_path text,
  byte_size integer,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create index if not exists backup_runs_homestead_completed_idx
  on backup_runs (homestead_id, completed_at desc);
