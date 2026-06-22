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
