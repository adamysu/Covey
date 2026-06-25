alter table birds
  add column if not exists bird_type text;

create index if not exists birds_homestead_bird_type_idx
  on birds (homestead_id, bird_type)
  where bird_type is not null and btrim(bird_type) <> '';
