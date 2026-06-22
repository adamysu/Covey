create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  sold_on date not null,
  item_type text not null check (item_type in ('TABLE_EGGS', 'FERTILE_EGGS', 'CHICKS', 'BIRDS', 'MEAT', 'OTHER')),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null default 'each',
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  total_price numeric(12, 2) generated always as (quantity * unit_price) stored,
  buyer text,
  coop_id uuid references coops(id) on delete set null,
  bird_id uuid references birds(id) on delete set null,
  breeding_line_id uuid references breeding_lines(id) on delete set null,
  mating_period_id uuid references mating_periods(id) on delete set null,
  incubation_id uuid references incubations(id) on delete set null,
  hatch_batch_id uuid references hatch_batches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_homestead_sold_on_idx on sales (homestead_id, sold_on desc);
create index if not exists sales_homestead_item_type_idx on sales (homestead_id, item_type);

create table if not exists bird_health_events (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  bird_id uuid references birds(id) on delete set null,
  coop_id uuid references coops(id) on delete set null,
  observed_on date not null,
  event_type text not null check (event_type in ('HEALTH', 'INJURY', 'TREATMENT', 'QUARANTINE', 'BEHAVIOR', 'MORTALITY', 'OTHER')),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  outcome text not null default 'OPEN' check (outcome in ('OPEN', 'MONITORING', 'RESOLVED', 'CULLED', 'DIED')),
  title text not null,
  notes text,
  treatment text,
  follow_up_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bird_health_events_homestead_observed_on_idx on bird_health_events (homestead_id, observed_on desc);
create index if not exists bird_health_events_homestead_follow_up_idx on bird_health_events (homestead_id, follow_up_on) where follow_up_on is not null;
create index if not exists bird_health_events_homestead_outcome_idx on bird_health_events (homestead_id, outcome);
