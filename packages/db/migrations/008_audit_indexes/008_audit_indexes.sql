create index if not exists audit_events_homestead_created_idx
  on audit_events (homestead_id, created_at desc);

create index if not exists audit_events_entity_idx
  on audit_events (homestead_id, entity_type, entity_id, created_at desc);
