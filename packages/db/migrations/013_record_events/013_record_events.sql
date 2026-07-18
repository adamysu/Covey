create table if not exists record_events (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  bird_id uuid references birds(id) on delete cascade,
  coop_id uuid references coops(id) on delete cascade,
  mating_period_id uuid references mating_periods(id) on delete cascade,
  happened_on date not null,
  category text not null check (
    category in ('NOTE', 'MOVEMENT', 'BEHAVIOR', 'BREEDING', 'PROCESSING', 'LOSS', 'OTHER')
  ),
  title text not null,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(bird_id, coop_id, mating_period_id) >= 1)
);

create index if not exists record_events_homestead_date_idx
  on record_events (homestead_id, happened_on desc, created_at desc);
create index if not exists record_events_bird_idx
  on record_events (bird_id, happened_on desc) where bird_id is not null;
create index if not exists record_events_coop_idx
  on record_events (coop_id, happened_on desc) where coop_id is not null;
create index if not exists record_events_mating_period_idx
  on record_events (mating_period_id, happened_on desc) where mating_period_id is not null;
