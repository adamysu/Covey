alter table hatch_batches
  add column if not exists mating_period_id uuid references mating_periods(id) on delete set null;

alter table hatch_batches
  add column if not exists incubation_id uuid references incubations(id) on delete set null;

create unique index if not exists hatch_batches_incubation_id_key
  on hatch_batches (incubation_id)
  where incubation_id is not null;
