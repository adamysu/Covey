create table if not exists feed_inventory_events (
  id uuid primary key default gen_random_uuid(),
  homestead_id uuid not null references homesteads(id) on delete cascade,
  feed_type_id uuid not null references feed_types(id) on delete restrict,
  logged_at timestamptz not null default now(),
  amount numeric(10, 3) not null,
  unit text not null check (unit in ('bag', 'cup', 'lb', 'oz')),
  amount_cups numeric(12, 3) not null,
  cost numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_inventory_events_homestead_logged_idx
  on feed_inventory_events (homestead_id, logged_at desc);

create index if not exists feed_inventory_events_feed_type_idx
  on feed_inventory_events (feed_type_id);
