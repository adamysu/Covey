alter table coops
  add column if not exists camera_rtsp_url text;

alter table feed_types
  add column if not exists inventory_cups numeric(12, 3) not null default 0;
