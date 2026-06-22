create extension if not exists pgcrypto;

create table if not exists homesteads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists homestead_settings (
  homestead_id uuid primary key references homesteads(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null check (role in ('OWNER', 'KEEPER', 'VIEWER')),
  password_hash text not null,
  mfa_secret text,
  mfa_enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_key on users (lower(email));

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists coops (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  name text not null,
  type text not null check (type in ('BREEDING', 'GROW_OUT', 'BROODER', 'HOSPITAL', 'OTHER')),
  capacity integer,
  camera_rtsp_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homestead_id, name)
);

create table if not exists breeding_lines (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  name text not null,
  goal text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homestead_id, name)
);

create table if not exists hatch_batches (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  breeding_line_id uuid references breeding_lines(id) on delete set null,
  label text not null,
  hatch_date date,
  eggs_set integer not null default 0,
  fertile_eggs integer,
  hatched_count integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homestead_id, label)
);

create table if not exists birds (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  hatch_batch_id uuid references hatch_batches(id) on delete set null,
  breeding_line_id uuid references breeding_lines(id) on delete set null,
  coop_id uuid references coops(id) on delete set null,
  name text,
  band text,
  sex text not null check (sex in ('MALE', 'FEMALE', 'UNKNOWN')),
  status text not null check (status in ('ACTIVE', 'PROCESSED', 'SOLD', 'DIED', 'RETIRED', 'CULLED')),
  hatch_date date,
  processed_date date,
  current_weight_oz numeric(8, 2),
  dressed_weight_oz numeric(8, 2),
  temperament text,
  breeder_rating text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists birds_active_band_unique
  on birds (homestead_id, lower(band))
  where status = 'ACTIVE' and band is not null and btrim(band) <> '';

create table if not exists mating_periods (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  breeding_line_id uuid not null references breeding_lines(id) on delete cascade,
  coop_id uuid references coops(id) on delete set null,
  sire_id uuid references birds(id) on delete set null,
  label text not null,
  started_on date not null,
  ended_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mating_period_hens (
  mating_period_id uuid not null references mating_periods(id) on delete cascade,
  hen_id uuid not null references birds(id) on delete cascade,
  joined_on date not null,
  left_on date,
  primary key (mating_period_id, hen_id, joined_on)
);

create table if not exists incubations (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  mating_period_id uuid references mating_periods(id) on delete set null,
  hatch_batch_id uuid references hatch_batches(id) on delete set null,
  label text not null,
  set_date date not null,
  expected_hatch_date date not null,
  lockdown_date date,
  candle_date date,
  eggs_set integer not null,
  fertile_eggs integer,
  hatched_count integer,
  parameters jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homestead_id, label)
);

create table if not exists feed_types (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  brand text not null,
  name text not null,
  vendor text,
  protein_percent numeric(5, 2),
  bag_weight_lb numeric(8, 2) not null,
  bag_cost numeric(10, 2) not null,
  cup_weight_oz numeric(8, 3) not null default 8,
  inventory_cups numeric(12, 3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feed_logs (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  coop_id uuid not null references coops(id) on delete cascade,
  feed_type_id uuid not null references feed_types(id) on delete restrict,
  logged_at timestamptz not null default now(),
  amount numeric(10, 3) not null,
  unit text not null check (unit in ('cup', 'lb', 'oz')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists egg_logs (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  coop_id uuid references coops(id) on delete set null,
  bird_id uuid references birds(id) on delete set null,
  logged_on date not null,
  quantity integer not null check (quantity >= 0),
  fertile_quantity integer check (fertile_quantity >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  bird_id uuid not null references birds(id) on delete cascade,
  weighed_on date not null,
  weight_oz numeric(8, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (bird_id, weighed_on)
);

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

create table if not exists photo_attachments (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  entity_type text not null check (entity_type in ('BIRD', 'FEED', 'HEALTH_EVENT')),
  entity_id uuid not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  storage_path text not null,
  byte_size integer not null check (byte_size > 0),
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists photo_attachments_homestead_entity_idx on photo_attachments (homestead_id, entity_type, entity_id, created_at desc);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid references homesteads(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table hatch_batches
  add column if not exists mating_period_id uuid references mating_periods(id) on delete set null;

alter table hatch_batches
  add column if not exists incubation_id uuid references incubations(id) on delete set null;

create unique index if not exists hatch_batches_incubation_id_key
  on hatch_batches (incubation_id)
  where incubation_id is not null;
